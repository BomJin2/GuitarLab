import { beforeEach, expect, it, vi } from 'vitest';
import {
  decodeProjectBacking,
  projectBackingApi,
  type ProjectBacking,
} from './projectBacking';
import { runStorageJob } from '../library/projects';
vi.mock('../library/projects', async (original) => ({
  ...(await original<typeof import('../library/projects')>()),
  runStorageJob: vi.fn(),
}));
const id = '00000000-0000-4000-8000-000000000001';
const value: ProjectBacking = {
  schemaVersion: 1,
  projectId: id,
  selection: {
    kind: 'YOUTUBE_EMBED',
    videoId: 'Ab_cD-12345',
    selectedByUser: true,
  },
};
beforeEach(() => vi.mocked(runStorageJob).mockReset());
it('정확한 프로젝트의 v1·명시적 선택/해제만 수용한다', () => {
  expect(decodeProjectBacking(value, id)).toEqual(value);
  expect(
    decodeProjectBacking({ ...value, selection: null }, id).selection,
  ).toBeNull();
  for (const malformed of [
    null,
    {},
    { schemaVersion: 1, projectId: id },
    { ...value, schemaVersion: 2 },
    { ...value, projectId: '00000000-0000-4000-8000-000000000002' },
    { ...value, path: '../escape' },
    { ...value, selection: { ...value.selection, selectedByUser: false } },
    { ...value, selection: { ...value.selection, kind: 'LOCAL_ASSET' } },
    {
      ...value,
      selection: {
        ...value.selection,
        videoId: 'https://youtu.be/Ab_cD-12345',
      },
    },
    { ...value, selection: { ...value.selection, extra: true } },
  ]) {
    expect(() => decodeProjectBacking(malformed, id)).toThrow(
      'BACKING_CONTRACT_INVALID',
    );
  }
});
it('공용 취소 작업으로 명령을 호출하고 저장한 선택이 다른 응답을 거부한다', async () => {
  const signal = new AbortController().signal;
  const progress = vi.fn();
  vi.mocked(runStorageJob).mockResolvedValue(value);
  expect(await projectBackingApi.load(id, signal, progress)).toEqual(value);
  expect(runStorageJob).toHaveBeenLastCalledWith(
    'get_project_backing',
    { projectId: id },
    signal,
    progress,
    { waitForCancellation: true },
  );
  expect(await projectBackingApi.save(value, signal, progress)).toEqual(value);
  expect(runStorageJob).toHaveBeenLastCalledWith(
    'save_backing_selection',
    value,
    signal,
    progress,
    { waitForCancellation: true },
  );
  vi.mocked(runStorageJob).mockResolvedValue({ ...value, selection: null });
  await expect(projectBackingApi.save(value, signal, progress)).rejects.toThrow(
    'BACKING_CONTRACT_INVALID',
  );
  await expect(
    projectBackingApi.load('../escape', signal, progress),
  ).rejects.toThrow('BACKING_CONTRACT_INVALID');
  expect(runStorageJob).toHaveBeenCalledTimes(3);
});
it('취소 뒤 늦은 성공 응답을 사용하지 않는다', async () => {
  const controller = new AbortController();
  let finish: (value: ProjectBacking) => void = () => undefined;
  vi.mocked(runStorageJob).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const pending = projectBackingApi.load(id, controller.signal, vi.fn());
  controller.abort();
  finish(value);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
