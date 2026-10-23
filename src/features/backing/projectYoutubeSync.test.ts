import { beforeEach, expect, it, vi } from 'vitest';
import {
  decodeProjectYoutubeSync,
  projectYoutubeSyncApi,
  type ProjectYoutubeSync,
  type YoutubeSyncKey,
} from './projectYoutubeSync';
import { runStorageJob } from '../library/projects';
vi.mock('../library/projects', async (original) => ({
  ...(await original<typeof import('../library/projects')>()),
  runStorageJob: vi.fn(),
}));
const key: YoutubeSyncKey = {
  schemaVersion: 1,
  projectId: '00000000-0000-4000-8000-000000000001',
  revisionId: '00000000-0000-4000-8000-000000000002',
  videoId: 'Ab_cD-12345',
  trackId: 'guitar',
};
const value: ProjectYoutubeSync = {
  ...key,
  profile: {
    scoreId: 'score',
    endTick: 3840,
    durationMs: 20000,
    anchors: [
      { scoreTick: 0, audioTimeMs: 1000 },
      { scoreTick: 3840, audioTimeMs: 10000 },
    ],
  },
};
beforeEach(() => vi.mocked(runStorageJob).mockReset());
it('맞는 버전·프로젝트·revision·영상·트랙과 정확한 두 지점만 읽는다', () => {
  expect(decodeProjectYoutubeSync(value, key)).toEqual(value);
  expect(
    decodeProjectYoutubeSync({ ...key, profile: null }, key).profile,
  ).toBeNull();
  for (const bad of [
    null,
    {},
    key,
    { ...value, schemaVersion: 2 },
    { ...value, projectId: key.revisionId },
    { ...value, revisionId: key.projectId },
    { ...value, videoId: 'zY_xW-98765' },
    { ...value, trackId: 'other' },
    { ...value, path: '../private' },
    { ...value, profile: { ...value.profile, durationMs: Infinity } },
    {
      ...value,
      profile: {
        ...value.profile,
        anchors: [
          { scoreTick: 0, audioTimeMs: 0 },
          { scoreTick: 0, audioTimeMs: 1 },
        ],
      },
    },
    {
      ...value,
      profile: {
        ...value.profile,
        anchors: [
          { scoreTick: 0, audioTimeMs: -1 },
          { scoreTick: 3840, audioTimeMs: 2 },
        ],
      },
    },
    {
      ...value,
      profile: {
        ...value.profile,
        anchors: [
          { scoreTick: 0, audioTimeMs: 0, extra: true },
          { scoreTick: 3840, audioTimeMs: 1 },
        ],
      },
    },
  ])
    expect(() => decodeProjectYoutubeSync(bad, key)).toThrow(
      'YOUTUBE_SYNC_CONTRACT_INVALID',
    );
});
it('공용 작업 종료까지 취소를 기다리고 저장 결과 교체를 거부한다', async () => {
  const signal = new AbortController().signal;
  const progress = vi.fn();
  vi.mocked(runStorageJob).mockResolvedValue(value);
  expect(await projectYoutubeSyncApi.load(key, signal, progress)).toEqual(
    value,
  );
  expect(runStorageJob).toHaveBeenLastCalledWith(
    'get_youtube_sync',
    key,
    signal,
    progress,
    { waitForCancellation: true },
  );
  expect(await projectYoutubeSyncApi.save(value, signal, progress)).toEqual(
    value,
  );
  vi.mocked(runStorageJob).mockResolvedValue({ ...key, profile: null });
  await expect(
    projectYoutubeSyncApi.save(value, signal, progress),
  ).rejects.toThrow('YOUTUBE_SYNC_CONTRACT_INVALID');
  const controller = new AbortController();
  controller.abort();
  await expect(
    projectYoutubeSyncApi.load(key, controller.signal, progress),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
