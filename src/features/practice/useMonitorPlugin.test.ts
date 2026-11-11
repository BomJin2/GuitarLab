import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyMonitorPlugin, monitorPluginApi } from './monitorPlugin';
import { useMonitorPlugin } from './useMonitorPlugin';

afterEach(() => vi.restoreAllMocks());
const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const none = (projectId: string) => ({
  schemaVersion: 1 as const,
  projectId,
  saved: false,
  classId: null,
  pluginVersion: null,
  bytes: null,
});

it('이전 프로젝트의 늦은 톤 저장 응답이 지금 프로젝트의 저장 상태를 덮지 않는다(리뷰 R4-2)', async () => {
  vi.spyOn(monitorPluginApi, 'status').mockResolvedValue(emptyMonitorPlugin);
  vi.spyOn(monitorPluginApi, 'projectTone').mockImplementation(async (id) =>
    none(id),
  );
  let answer: () => void = () => {};
  vi.spyOn(monitorPluginApi, 'saveProjectTone').mockImplementation(
    (id) =>
      new Promise((resolve) => {
        answer = () =>
          resolve({ ...none(id), saved: true, classId: 'c', bytes: 10 });
      }),
  );
  const hook = renderHook(({ id }) => useMonitorPlugin(true, id), {
    initialProps: { id: A },
  });
  await waitFor(() => expect(hook.result.current.tone?.projectId).toBe(A));
  let saving: Promise<unknown> | undefined;
  act(() => {
    saving = hook.result.current.saveTone() || undefined;
  });
  hook.rerender({ id: B });
  await waitFor(() => expect(hook.result.current.tone?.projectId).toBe(B));
  await act(async () => {
    answer();
    await saving;
  });
  expect(hook.result.current.tone).toEqual(none(B));
  hook.unmount();
});

it('늦은 최초 톤 조회가 같은 프로젝트의 저장 성공을 덮지 않는다(리뷰 R5-5)', async () => {
  vi.spyOn(monitorPluginApi, 'status').mockResolvedValue(emptyMonitorPlugin);
  let lookup: () => void = () => {};
  vi.spyOn(monitorPluginApi, 'projectTone').mockImplementation(
    (id) =>
      new Promise((resolve) => {
        lookup = () => resolve(none(id));
      }),
  );
  vi.spyOn(monitorPluginApi, 'saveProjectTone').mockImplementation(
    async (id) => ({ ...none(id), saved: true, classId: 'c', bytes: 10 }),
  );
  const hook = renderHook(() => useMonitorPlugin(true, A));
  await act(async () => {
    await hook.result.current.saveTone();
  });
  expect(hook.result.current.tone?.saved).toBe(true);
  await act(async () => {
    lookup();
  });
  expect(hook.result.current.tone?.saved).toBe(true);
  hook.unmount();
});

it('모니터를 끄면 플러그인 상태를 다시 읽어 사용 중 표시가 풀린다(리뷰 R8-1)', async () => {
  const status = vi
    .spyOn(monitorPluginApi, 'status')
    .mockResolvedValueOnce({ ...emptyMonitorPlugin, inUse: true })
    .mockResolvedValue({ ...emptyMonitorPlugin, inUse: false });
  vi.spyOn(monitorPluginApi, 'projectTone').mockImplementation(async (id) =>
    none(id),
  );
  const hook = renderHook(({ m }) => useMonitorPlugin(true, A, m), {
    initialProps: { m: 'RUNNING' },
  });
  await waitFor(() => expect(hook.result.current.state.inUse).toBe(true));
  hook.rerender({ m: 'STOPPED' });
  await waitFor(() => expect(hook.result.current.state.inUse).toBe(false));
  expect(status).toHaveBeenCalledTimes(2);
  hook.unmount();
});
