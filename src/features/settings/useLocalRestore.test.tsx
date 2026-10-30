import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { localRestoreApi, type LocalRestoreStatus } from './localRestore';
import { useLocalRestore } from './useLocalRestore';
vi.mock('./localRestore', async (importOriginal) => {
  const source = await importOriginal<typeof import('./localRestore')>();
  return {
    ...source,
    localRestoreApi: {
      available: vi.fn(() => true),
      status: vi.fn(),
      schedule: vi.fn(),
      cancel: vi.fn(),
    },
  };
});
const idle: LocalRestoreStatus = { schemaVersion: 1, state: 'IDLE' };
afterEach(cleanup);
const scheduled: LocalRestoreStatus = {
  schemaVersion: 1,
  state: 'SCHEDULED',
  recoveryId: '00000000-0000-4000-8000-000000000001',
  files: 1,
  bytes: 2,
  externalReferencesNotCopied: 0,
  databaseVersion: 10,
  restartRequired: true,
  errorCode: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(localRestoreApi.status).mockResolvedValue(idle);
});
it('동의 없이 예약하지 않고 중복 작업을 막는다', async () => {
  const { result } = renderHook(useLocalRestore);
  await waitFor(() => expect(result.current.status).toEqual(idle));
  await act(() => result.current.schedule());
  expect(localRestoreApi.schedule).not.toHaveBeenCalled();
  let resolve: (v: LocalRestoreStatus) => void = () => {
    throw new Error('대기 미설정');
  };
  vi.mocked(localRestoreApi.schedule).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  act(() => result.current.setConsent(true));
  let pending: Promise<void>;
  act(() => {
    pending = result.current.schedule();
  });
  await act(() => result.current.schedule());
  expect(localRestoreApi.schedule).toHaveBeenCalledTimes(1);
  vi.mocked(localRestoreApi.status).mockResolvedValue(scheduled);
  await act(async () => {
    resolve(scheduled);
    await pending;
  });
  expect(result.current.status).toEqual(scheduled);
});
it('늦은 취소 뒤 이미 게시된 예약을 해제됐다고 표시하지 않는다', async () => {
  const { result } = renderHook(useLocalRestore);
  await waitFor(() => expect(result.current.status).toEqual(idle));
  let resolve: (v: LocalRestoreStatus) => void = () => {
    throw new Error('대기 미설정');
  };
  vi.mocked(localRestoreApi.schedule).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  act(() => result.current.setConsent(true));
  let pending: Promise<void>;
  act(() => {
    pending = result.current.schedule();
  });
  act(() => result.current.cancelJob());
  vi.mocked(localRestoreApi.status).mockResolvedValue(scheduled);
  await act(async () => {
    resolve(scheduled);
    await pending;
  });
  expect(result.current.status?.state).toBe('SCHEDULED');
  expect(localRestoreApi.cancel).not.toHaveBeenCalled();
});
it('실제 조회 실패 시 예약 여부를 추정하지 않는다', async () => {
  const { result } = renderHook(useLocalRestore);
  await waitFor(() => expect(result.current.status).toEqual(idle));
  vi.mocked(localRestoreApi.status).mockRejectedValue(new Error('private'));
  await act(() => result.current.refresh());
  expect(result.current.status).toBeNull();
  expect(result.current.notice).not.toContain('private');
});
