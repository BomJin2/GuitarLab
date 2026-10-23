import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  projectYoutubeSyncApi,
  type ProjectYoutubeSync,
  type YoutubeSyncKey,
} from './projectYoutubeSync';
import { useYoutubeSyncStorage } from './useYoutubeSyncStorage';
vi.mock('./projectYoutubeSync', async (original) => ({
  ...(await original<typeof import('./projectYoutubeSync')>()),
  projectYoutubeSyncApi: {
    available: () => true,
    load: vi.fn(),
    save: vi.fn(),
  },
}));
const key: YoutubeSyncKey = {
  schemaVersion: 1,
  projectId: '00000000-0000-4000-8000-000000000001',
  revisionId: '00000000-0000-4000-8000-000000000002',
  videoId: 'Ab_cD-12345',
  trackId: 'guitar',
};
const profile = {
  scoreId: 'score',
  endTick: 3840,
  durationMs: 20000,
  anchors: [
    { scoreTick: 0, audioTimeMs: 1000 },
    { scoreTick: 3840, audioTimeMs: 10000 },
  ],
};
const value: ProjectYoutubeSync = { ...key, profile };
beforeEach(() => vi.clearAllMocks());
it('명시적 조회만 복원하고 저장·삭제는 화면 적용/YouTube 연결을 바꾸지 않는다', async () => {
  vi.mocked(projectYoutubeSyncApi.load).mockResolvedValue(value);
  vi.mocked(projectYoutubeSyncApi.save).mockImplementation(
    async (request) => request,
  );
  const restore = vi.fn();
  const hook = renderHook(() => useYoutubeSyncStorage(key, false, restore));
  expect(projectYoutubeSyncApi.load).not.toHaveBeenCalled();
  await act(async () => {
    await hook.result.current.save(profile);
    await hook.result.current.clear();
  });
  expect(restore).not.toHaveBeenCalled();
  expect(projectYoutubeSyncApi.save).toHaveBeenLastCalledWith(
    { ...key, profile: null },
    expect.any(AbortSignal),
    expect.any(Function),
  );
  await act(async () => {
    await hook.result.current.load();
  });
  expect(restore).toHaveBeenCalledWith(profile);
});
it('취소·다른 문맥·REC/관측 잠금·unmount에서 늦은 복원을 버리고 native 종료까지 잠근다', async () => {
  let finish: (value: ProjectYoutubeSync) => void = () => undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(projectYoutubeSyncApi.load).mockImplementation((_key, current) => {
    signal = current;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const restore = vi.fn();
  const initialProps: { key: YoutubeSyncKey | null; locked: boolean } = {
    key,
    locked: false,
  };
  const hook = renderHook(
    (props: { key: YoutubeSyncKey | null; locked: boolean }) =>
      useYoutubeSyncStorage(props.key, props.locked, restore),
    { initialProps },
  );
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.load();
  });
  act(() => hook.result.current.cancel());
  expect(signal?.aborted).toBe(true);
  expect(hook.result.current.busy).toBe(true);
  await act(async () => {
    await hook.result.current.load();
    finish(value);
    await pending;
  });
  expect(projectYoutubeSyncApi.load).toHaveBeenCalledOnce();
  for (const change of [
    { key: { ...key, revisionId: key.projectId }, locked: false },
    { key: { ...key, videoId: 'zY_xW-98765' }, locked: false },
    { key, locked: true },
    { key: null, locked: false },
  ]) {
    hook.rerender({ key, locked: false });
    act(() => {
      pending = hook.result.current.load();
    });
    hook.rerender(change);
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish(value);
      await pending;
    });
  }
  hook.rerender({ key, locked: false });
  act(() => {
    pending = hook.result.current.load();
  });
  hook.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish(value);
    await pending;
  });
  expect(restore).not.toHaveBeenCalled();
});
it('미저장 문맥은 차단하고 네이티브 실패 원문을 표시하지 않는다', async () => {
  const restore = vi.fn();
  const hook = renderHook(
    (current: YoutubeSyncKey | null) =>
      useYoutubeSyncStorage(current, false, restore),
    { initialProps: null as YoutubeSyncKey | null },
  );
  await act(async () => {
    await hook.result.current.load();
  });
  expect(projectYoutubeSyncApi.load).not.toHaveBeenCalled();
  hook.rerender(key);
  vi.mocked(projectYoutubeSyncApi.load).mockRejectedValue(
    new Error('개인 경로'),
  );
  await act(async () => {
    await hook.result.current.load();
  });
  expect(hook.result.current.error).not.toContain('개인 경로');
  expect(restore).not.toHaveBeenCalled();
});
