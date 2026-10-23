import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { projectBackingApi, type ProjectBacking } from './projectBacking';
import { useProjectBacking } from './useProjectBacking';
vi.mock('./projectBacking', async (original) => ({
  ...(await original<typeof import('./projectBacking')>()),
  projectBackingApi: { available: () => true, load: vi.fn(), save: vi.fn() },
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
beforeEach(() => vi.clearAllMocks());
it('자동 조회하지 않고 명시적 읽기는 URL만 복원하며 저장·해제를 분리한다', async () => {
  vi.mocked(projectBackingApi.load).mockResolvedValue(value);
  vi.mocked(projectBackingApi.save).mockImplementation(
    async (document) => document,
  );
  const restore = vi.fn();
  const hook = renderHook(() => useProjectBacking(id, false, restore));
  expect(projectBackingApi.load).not.toHaveBeenCalled();
  await act(async () => {
    await hook.result.current.load();
  });
  expect(restore).toHaveBeenLastCalledWith(
    'https://www.youtube.com/watch?v=Ab_cD-12345',
  );
  restore.mockClear();
  await act(async () => {
    await hook.result.current.save('https://youtu.be/Ab_cD-12345?si=discarded');
  });
  expect(projectBackingApi.save).toHaveBeenLastCalledWith(
    value,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(restore).not.toHaveBeenCalled();
  await act(async () => {
    await hook.result.current.clear();
  });
  expect(hook.result.current.stored).toBeNull();
  expect(projectBackingApi.save).toHaveBeenLastCalledWith(
    { ...value, selection: null },
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(restore).not.toHaveBeenCalled();
});
it('잠금·프로젝트 없음·잘못된 URL은 쓰지 않고 실패 원문을 UI에 노출하지 않는다', async () => {
  const restore = vi.fn();
  const initialProps: { projectId: string | undefined; locked: boolean } = {
    projectId: undefined,
    locked: false,
  };
  const hook = renderHook(
    (props: { projectId: string | undefined; locked: boolean }) =>
      useProjectBacking(props.projectId, props.locked, restore),
    { initialProps },
  );
  await act(async () => {
    await hook.result.current.load();
    await hook.result.current.clear();
  });
  expect(projectBackingApi.load).not.toHaveBeenCalled();
  hook.rerender({ projectId: id, locked: true });
  await act(async () => {
    await hook.result.current.save('https://youtu.be/Ab_cD-12345');
  });
  expect(projectBackingApi.save).not.toHaveBeenCalled();
  hook.rerender({ projectId: id, locked: false });
  await act(async () => {
    await hook.result.current.save('file:///private');
  });
  expect(projectBackingApi.save).not.toHaveBeenCalled();
  expect(hook.result.current.error).toContain('주소를 확인');
  vi.mocked(projectBackingApi.load).mockRejectedValue(new Error('개인 경로'));
  await act(async () => {
    await hook.result.current.load();
  });
  expect(hook.result.current.error).not.toContain('개인 경로');
});
it('취소는 native 종료까지 잠금을 유지하고 늦은 복원/저장은 버린다', async () => {
  let finish: (value: ProjectBacking) => void = () => undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(projectBackingApi.load).mockImplementation((_id, current) => {
    signal = current;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const restore = vi.fn();
  const hook = renderHook(() => useProjectBacking(id, false, restore));
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
  expect(projectBackingApi.load).toHaveBeenCalledOnce();
  expect(hook.result.current.busy).toBe(false);
  expect(restore).not.toHaveBeenCalled();
  expect(hook.result.current.notice).toContain('확정값');
});
it('프로젝트 전환·REC 잠금·unmount로 이전 작업을 취소하고 이전 선택을 복원하지 않는다', async () => {
  let finish: (value: ProjectBacking) => void = () => undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(projectBackingApi.load).mockImplementation((_id, current) => {
    signal = current;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const restore = vi.fn();
  const hook = renderHook(
    (props) => useProjectBacking(props.id, props.locked, restore),
    { initialProps: { id, locked: false } },
  );
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.load();
  });
  hook.rerender({ id: '00000000-0000-4000-8000-000000000002', locked: false });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish(value);
    await pending;
  });
  expect(hook.result.current.stored).toBeUndefined();
  expect(restore).not.toHaveBeenCalled();
  act(() => {
    pending = hook.result.current.load();
  });
  hook.rerender({ id, locked: true });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish(value);
    await pending;
  });
  expect(restore).not.toHaveBeenCalled();
  hook.rerender({ id, locked: false });
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
