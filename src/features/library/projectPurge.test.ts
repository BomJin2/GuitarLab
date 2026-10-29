import { invoke } from '@tauri-apps/api/core';
import { beforeEach, expect, it, vi } from 'vitest';
import { projectFixture } from '../../test/projectFixture';
import {
  decodePurgePlan,
  projectPurgeApi,
  type PurgePlan,
} from './projectPurge';
import { decodeTrashedProject, type TrashedProject } from './projectTrash';
import { decodeJob, projectError } from './projects';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
const jobId = '00000000-0000-4000-8000-0000000000f2';
function entry(): TrashedProject {
  return { project: projectFixture().project, trashId: jobId, trashedAtMs: 42 };
}
function plan(): PurgePlan {
  const current = entry();
  return {
    projectId: current.project.id,
    trashId: current.trashId,
    revision: current.project.revision,
    title: current.project.title,
    fingerprint: 'a'.repeat(64),
    files: 2,
    logicalBytes: 3 * 1024 ** 3,
    externalReferences: 1,
    purgeStarted: false,
  };
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
it('계획은 정확한 필드·ID·상한·지문·시작 상태를 요구한다', () => {
  const current = plan();
  expect(decodePurgePlan(current)).toEqual(current);
  for (const bad of [
    null,
    { ...current, path: 'private' },
    { ...current, files: 10001 },
    { ...current, logicalBytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...current, fingerprint: 'A'.repeat(64) },
    { ...current, title: '\n' },
    { ...current, purgeStarted: 1 },
    { ...current, files: 0 },
  ])
    expect(() => decodePurgePlan(bad)).toThrow('PROJECT_CONTRACT_INVALID');
  expect(
    decodeTrashedProject({ ...entry(), purgeStarted: true }).purgeStarted,
  ).toBe(true);
  expect(() =>
    decodeTrashedProject({ ...entry(), purgeStarted: false }),
  ).toThrow();
});
it('준비는 현재 프로젝트·marker·제목·revision과 시작 상태를 확인한다', async () => {
  const current = plan();
  const signal = new AbortController().signal;
  vi.mocked(invoke).mockResolvedValueOnce(
    job('COMPLETED', {
      schemaVersion: 1,
      state: 'PROJECT_PURGE_PREPARED',
      plan: current,
    }),
  );
  await expect(
    projectPurgeApi.prepare(entry(), signal, () => undefined),
  ).resolves.toEqual(current);
  expect(invoke).toHaveBeenLastCalledWith('prepare_trashed_project_purge', {
    request: {
      schemaVersion: 1,
      projectId: current.projectId,
      trashId: current.trashId,
    },
  });
  for (const altered of [
    { ...current, title: '다른 제목' },
    { ...current, revision: current.revision + 1 },
    { ...current, purgeStarted: true },
    { ...current, projectId: jobId },
  ]) {
    vi.mocked(invoke).mockResolvedValueOnce(
      job('COMPLETED', {
        schemaVersion: 1,
        state: 'PROJECT_PURGE_PREPARED',
        plan: altered,
      }),
    );
    await expect(
      projectPurgeApi.prepare(entry(), signal, () => undefined),
    ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
  }
});
it('직접 입력과 동의가 없으면 삭제 명령을 보내지 않는다', async () => {
  for (const [title, consent] of [
    ['다른 제목', true],
    [plan().title, false],
  ] as const)
    await expect(
      projectPurgeApi.purge(
        plan(),
        title,
        consent,
        new AbortController().signal,
        () => undefined,
      ),
    ).rejects.toThrow('PROJECT_PURGE_CONFIRMATION_REQUIRED');
  expect(invoke).not.toHaveBeenCalled();
});
it('삭제 결과는 현재 대상과 정확한 파일·논리 크기를 대조한다', async () => {
  const current = plan();
  const result = {
    schemaVersion: 1,
    state: 'PROJECT_PURGED',
    projectId: current.projectId,
    trashId: current.trashId,
    files: current.files,
    logicalBytes: current.logicalBytes,
    externalReferences: current.externalReferences,
  };
  vi.mocked(invoke).mockResolvedValueOnce(job('COMPLETED', result));
  await expect(
    projectPurgeApi.purge(
      current,
      current.title,
      true,
      new AbortController().signal,
      () => undefined,
    ),
  ).resolves.toMatchObject({ files: 2 });
  expect(invoke).toHaveBeenLastCalledWith('purge_trashed_project', {
    request: {
      schemaVersion: 1,
      projectId: current.projectId,
      trashId: current.trashId,
      fingerprint: current.fingerprint,
      confirmedTitle: current.title,
      confirmPermanentDelete: true,
    },
  });
  vi.mocked(invoke).mockResolvedValueOnce(
    job('COMPLETED', { ...result, logicalBytes: 1 }),
  );
  await expect(
    projectPurgeApi.purge(
      current,
      current.title,
      true,
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
});
it('마지막 확인 취소와 부분 삭제 오류를 성공으로 바꾸지 않는다', async () => {
  const current = plan();
  vi.mocked(invoke).mockResolvedValueOnce(job('CANCELED'));
  await expect(
    projectPurgeApi.purge(
      current,
      current.title,
      true,
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  vi.mocked(invoke).mockResolvedValueOnce({
    ...job('ERROR'),
    errorCode: 'PROJECT_PURGE_CHANGED',
  });
  await expect(
    projectPurgeApi.purge(
      current,
      current.title,
      true,
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toThrow('PROJECT_PURGE_CHANGED');
  expect(projectError(new Error('PROJECT_PURGE_IN_PROGRESS'))).toContain(
    '일반 복원 대신',
  );
  expect(projectError(new Error('STORAGE_ERROR'))).not.toContain('보존');
  expect(projectError(new Error('PROJECT_CONTRACT_INVALID'))).not.toContain(
    '보존',
  );
});
it('큰 진행률은 두 삭제 명령만 허용하고 기존 백업/파일 한도를 보존한다', () => {
  const value = { ...job('RUNNING'), totalBytes: Number.MAX_SAFE_INTEGER };
  for (const command of [
    'prepare_trashed_project_purge',
    'purge_trashed_project',
  ])
    expect(decodeJob(value, command).totalBytes).toBe(Number.MAX_SAFE_INTEGER);
  for (const command of [
    '',
    'get_storage_job',
    'backup_local_data',
    'import_project_asset',
  ])
    expect(() => decodeJob(value, command)).toThrow('PROJECT_CONTRACT_INVALID');
});
