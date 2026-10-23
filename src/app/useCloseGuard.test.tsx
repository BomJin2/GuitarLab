import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listen } from '@tauri-apps/api/event';
import { closeGuardApi } from './closeGuard';
import { useCloseGuard } from './useCloseGuard';
import { scoreEditingFixture } from '../test/scoreEditingFixture';
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
const handlers = new Map<string, (event: { payload: unknown }) => void>();
const unlisten = vi.fn();
const id = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  handlers.clear();
  vi.spyOn(closeGuardApi, 'available').mockReturnValue(true);
  vi.spyOn(closeGuardApi, 'enable').mockResolvedValue();
  vi.spyOn(closeGuardApi, 'resolve').mockResolvedValue();
  vi.mocked(listen).mockImplementation(async (name, handler) => {
    handlers.set(name, (event) => handler({ ...event, event: name, id: 1 }));
    return unlisten;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function close() {
  act(() =>
    handlers.get('application-close-requested')?.({
      payload: { schemaVersion: 1, requestId: id },
    }),
  );
}
it('구독 후 활성화하고 최신 편집·저장 문서로 응답하며 해제 때 guard를 끄지 않는다', async () => {
  const original = scoreEditingFixture();
  const { rerender, unmount } = renderHook(
    ({ session }) => useCloseGuard(session),
    { initialProps: { session: original } },
  );
  await waitFor(() => expect(closeGuardApi.enable).toHaveBeenCalledOnce());
  close();
  expect(closeGuardApi.resolve).toHaveBeenLastCalledWith(id, false);
  const edited = {
    ...original,
    document: { ...original.document, title: '수정' },
  };
  rerender({ session: edited });
  close();
  expect(closeGuardApi.resolve).toHaveBeenLastCalledWith(id, true);
  rerender({
    session: {
      ...edited,
      savedRevision: {
        projectId: 'p',
        revisionId: 'r',
        document: edited.document,
      },
    },
  });
  close();
  expect(closeGuardApi.resolve).toHaveBeenLastCalledWith(id, false);
  unmount();
  expect(unlisten).toHaveBeenCalledTimes(2);
});
it('파일 작업 차단은 모든 화면에서 안내하고 잘못된 요청은 닫지 않는다', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { result } = renderHook(() => useCloseGuard(null));
  await waitFor(() => expect(closeGuardApi.enable).toHaveBeenCalled());
  act(() => handlers.get('application-close-blocked')?.({ payload: null }));
  expect(result.current.notice).toMatch(/파일 작업/);
  act(() => result.current.dismiss());
  act(() =>
    handlers.get('application-close-requested')?.({
      payload: { schemaVersion: 2, requestId: id },
    }),
  );
  expect(closeGuardApi.resolve).not.toHaveBeenCalled();
  expect(result.current.notice).toMatch(/다시/);
  expect(warn).toHaveBeenCalledWith('[GuitarLab]', 'CLOSE_GUARD_FAILED');
});
it('해제 후 도착한 구독은 제거하고 새 활성화나 종료 요청을 만들지 않는다', async () => {
  let finish: ((value: () => void) => void) | undefined;
  vi.mocked(listen).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { unmount } = renderHook(() => useCloseGuard(null));
  unmount();
  await act(async () => finish?.(unlisten));
  expect(unlisten).toHaveBeenCalledOnce();
  expect(closeGuardApi.enable).not.toHaveBeenCalled();
  expect(closeGuardApi.resolve).not.toHaveBeenCalled();
});
it('악보 교체 확인은 최신 편집에만 묻고 취소·확인 실패 뒤 문서를 유지한다', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const original = scoreEditingFixture();
  const { result, rerender } = renderHook(
    ({ session }) => useCloseGuard(session),
    { initialProps: { session: original } },
  );
  expect(await result.current.confirmReplacement()).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  const edited = {
    ...original,
    document: { ...original.document, title: '미저장' },
  };
  rerender({ session: edited });
  expect(await result.current.confirmReplacement()).toBe(false);
  confirm.mockReturnValue(true);
  expect(await result.current.confirmReplacement()).toBe(true);
  confirm.mockImplementation(() => {
    throw new Error('개인 정보가 포함될 수 있는 오류');
  });
  await act(async () =>
    expect(await result.current.confirmReplacement()).toBe(false),
  );
  expect(result.current.notice).toMatch(/먼저 저장/);
  expect(warn).toHaveBeenCalledWith('[GuitarLab]', 'CLOSE_GUARD_FAILED');
  rerender({
    session: {
      ...edited,
      savedRevision: {
        projectId: 'p',
        revisionId: 'r',
        document: edited.document,
      },
    },
  });
  expect(await result.current.confirmReplacement()).toBe(true);
});

it('Tauri 비동기 확인은 중복을 거절하고 취소·거절·문맥 변경·해제 후 승인을 폐기한다', async () => {
  const confirm = vi.fn<() => Promise<boolean>>();
  vi.stubGlobal('confirm', confirm);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const original = scoreEditingFixture();
  const edited = {
    ...original,
    document: { ...original.document, title: '편집' },
  };
  const { result, rerender, unmount } = renderHook(
    ({ session }) => useCloseGuard(session),
    { initialProps: { session: original } },
  );
  rerender({ session: edited });
  let finish: (value: boolean) => void = () => {
    throw new Error('대기 초기화');
  };
  confirm.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = result.current.confirmReplacement();
  expect(await result.current.confirmReplacement()).toBe(false);
  expect(confirm).toHaveBeenCalledOnce();
  finish(false);
  expect(await pending).toBe(false);
  confirm.mockRejectedValueOnce(new Error('개인 정보'));
  await act(async () =>
    expect(await result.current.confirmReplacement()).toBe(false),
  );
  expect(result.current.notice).toMatch(/먼저 저장/);
  const stale = result.current.confirmReplacement();
  rerender({
    session: {
      ...edited,
      document: { ...edited.document, title: '다른 편집' },
    },
  });
  finish(true);
  expect(await stale).toBe(false);
  const afterUnmount = result.current.confirmReplacement();
  unmount();
  finish(true);
  expect(await afterUnmount).toBe(false);
});
