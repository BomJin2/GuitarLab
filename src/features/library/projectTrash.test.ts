import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectFixture } from '../../test/projectFixture';
import { projectError } from './projects';
import {
  decodeTrashList,
  projectTrashApi,
  type TrashedProject,
} from './projectTrash';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
const id = '00000000-0000-4000-8000-0000000000f1';
const jobId = '00000000-0000-4000-8000-0000000000f2';
function entry(): TrashedProject {
  return { project: projectFixture().project, trashId: id, trashedAtMs: 42 };
}
function job(state: string, result: unknown = null) {
  return {
    schemaVersion: 1,
    jobId,
    state,
    completedBytes: 0,
    totalBytes: 0,
    result,
    errorCode: null,
  };
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());
it('목록은 엄격한 상태·필드·중복·현재 순서를 검증한다', () => {
  const first = entry();
  const valid = { schemaVersion: 1, projects: [first] };
  expect(decodeTrashList(valid)).toEqual([first]);
  for (const bad of [
    null,
    { ...valid, schemaVersion: 2 },
    { ...valid, path: 'private' },
    { ...valid, projects: [first, first] },
    { ...valid, projects: [{ ...first, trashedAtMs: -1 }] },
    { ...valid, projects: [{ ...first, trashId: 'bad' }] },
    {
      ...valid,
      projects: [{ ...first, project: { ...first.project, path: 'private' } }],
    },
  ]) {
    expect(() => decodeTrashList(bad)).toThrow('PROJECT_CONTRACT_INVALID');
  }
  const second = {
    ...first,
    project: { ...first.project, id: '00000000-0000-4000-8000-0000000000f3' },
    trashId: jobId,
    trashedAtMs: 43,
  };
  expect(() =>
    decodeTrashList({ schemaVersion: 1, projects: [first, second] }),
  ).toThrow();
  expect(
    decodeTrashList({ schemaVersion: 1, projects: [second, first] }),
  ).toHaveLength(2);
});
it('보관·복원은 현재 UUID/revision만 전달하며 타 프로젝트 응답을 거부한다', async () => {
  const current = entry();
  vi.mocked(invoke).mockResolvedValueOnce(
    job('COMPLETED', {
      schemaVersion: 1,
      state: 'PROJECT_TRASHED',
      entry: current,
    }),
  );
  await expect(
    projectTrashApi.trash(
      current.project,
      new AbortController().signal,
      () => undefined,
    ),
  ).resolves.toEqual(current);
  expect(invoke).toHaveBeenLastCalledWith('trash_project', {
    request: {
      schemaVersion: 1,
      projectId: current.project.id,
      expectedRevision: current.project.revision,
    },
  });
  vi.mocked(invoke).mockResolvedValueOnce(
    job('COMPLETED', {
      schemaVersion: 1,
      state: 'PROJECT_RESTORED',
      project: current.project,
    }),
  );
  await expect(
    projectTrashApi.restore(
      current,
      new AbortController().signal,
      () => undefined,
    ),
  ).resolves.toEqual(current.project);
  expect(invoke).toHaveBeenLastCalledWith('restore_trashed_project', {
    request: {
      schemaVersion: 1,
      projectId: current.project.id,
      trashId: current.trashId,
    },
  });
  vi.mocked(invoke).mockResolvedValueOnce(
    job('COMPLETED', {
      schemaVersion: 1,
      state: 'PROJECT_RESTORED',
      project: { ...current.project, id: jobId },
    }),
  );
  await expect(
    projectTrashApi.restore(
      current,
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
});
it('취소를 보내도 실제 완료까지 기다리며 늦은 취소로 성공을 숨기지 않는다', async () => {
  vi.useFakeTimers();
  const current = entry();
  const controller = new AbortController();
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === 'trash_project'
      ? job('RUNNING')
      : command === 'cancel_storage_job'
        ? job('CANCELING')
        : job('COMPLETED', {
            schemaVersion: 1,
            state: 'PROJECT_TRASHED',
            entry: current,
          }),
  );
  let finished = false;
  const pending = projectTrashApi
    .trash(current.project, controller.signal, () => undefined)
    .then((value) => {
      finished = true;
      return value;
    });
  await Promise.resolve();
  controller.abort();
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(invoke).toHaveBeenCalledWith('cancel_storage_job', {
    request: { schemaVersion: 1, jobId },
  });
  await vi.advanceTimersByTimeAsync(160);
  await expect(pending).resolves.toEqual(current);
});
it('native 취소·오류를 성공 응답으로 바꾸지 않는다', async () => {
  vi.mocked(invoke).mockResolvedValueOnce(job('CANCELED'));
  await expect(
    projectTrashApi.restore(
      entry(),
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  vi.mocked(invoke).mockResolvedValueOnce({
    ...job('ERROR'),
    errorCode: 'PROJECT_TRASH_CHANGED',
  });
  await expect(
    projectTrashApi.restore(
      entry(),
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toThrow('PROJECT_TRASH_CHANGED');
});
it('잘못된 외부 ID와 범위 밖 revision은 native 호출 전에 거부한다', async () => {
  const current = entry();
  for (const project of [
    { ...current.project, id: '../outside' },
    { ...current.project, revision: 4294967296 },
    { ...current.project, revision: 0.5 },
  ]) {
    await expect(
      projectTrashApi.trash(
        project,
        new AbortController().signal,
        () => undefined,
      ),
    ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
  }
  expect(invoke).not.toHaveBeenCalled();
});
it('job Error 코드도 안내하고 알 수 없는 오류 원문은 표시하지 않는다', () => {
  expect(projectError(new Error('PROJECT_TRASH_CHANGED'))).toMatch(
    /휴지통 상태/,
  );
  expect(projectError({ code: 'PROJECT_IN_TRASH' })).toMatch(/복원/);
  const message = projectError(new Error('C:\\private\\recording.wav'));
  expect(message).not.toContain('private');
  expect(message).toMatch(/보존/);
});
