import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { localBackupApi, type LocalBackupResult } from './localBackup';
import { useLocalBackup } from './useLocalBackup';
import type { JobSnapshot } from '../library/projects';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock('./localBackup', async (original) => ({
  ...(await original<typeof import('./localBackup')>()),
  localBackupApi: {
    available: () => true,
    create: vi.fn(),
    verify: vi.fn(),
    preview: vi.fn(),
  },
}));
const completed: LocalBackupResult = {
  schemaVersion: 1,
  state: 'COMPLETED',
  files: 3,
  bytes: 1024,
  externalReferencesNotCopied: 0,
  restoreSupported: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(localBackupApi.create).mockResolvedValue(completed);
  vi.mocked(localBackupApi.verify).mockResolvedValue({
    ...completed,
    state: 'VERIFIED',
  });
  vi.mocked(localBackupApi.preview).mockResolvedValue({
    ...completed,
    state: 'RESTORED_TO_NEW_FOLDER',
    appDataReplaced: false,
  });
});
afterEach(cleanup);

it.each(['CREATE', 'PREVIEW'] as const)(
  '%s: 해제한 동의를 예전 함수에서 재사용하지 않는다',
  async (mode) => {
    const { result } = renderHook(useLocalBackup);
    act(() => result.current.setConsent(true));
    const old = result.current;
    act(() => result.current.setConsent(false));
    await act(async () => {
      await old.start(mode);
    });
    expect(localBackupApi.create).not.toHaveBeenCalled();
    expect(localBackupApi.preview).not.toHaveBeenCalled();
  },
);
it.each(['CREATE', 'VERIFY', 'PREVIEW'] as const)(
  '%s: 화면 이탈 뒤 보관된 함수는 파일 선택을 시작하지 않는다',
  async (mode) => {
    const { result, unmount } = renderHook(useLocalBackup);
    act(() => result.current.setConsent(true));
    const old = result.current;
    unmount();
    await act(async () => {
      await old.start(mode);
    });
    expect(localBackupApi.create).not.toHaveBeenCalled();
    expect(localBackupApi.verify).not.toHaveBeenCalled();
    expect(localBackupApi.preview).not.toHaveBeenCalled();
  },
);
it('동의 해제와 같은 이벤트 안의 예전 명령도 실행하지 않는다', async () => {
  const { result } = renderHook(useLocalBackup);
  act(() => result.current.setConsent(true));
  const old = result.current;
  let work!: Promise<void>;
  act(() => {
    old.setConsent(false);
    work = old.start();
  });
  await act(async () => {
    await work;
  });
  expect(localBackupApi.create).not.toHaveBeenCalled();
});
it('현재 동의를 유지한 재시도와 동의 없는 읽기 전용 검사는 허용한다', async () => {
  const { result } = renderHook(useLocalBackup);
  await act(async () => {
    await result.current.verify();
  });
  expect(result.current.result?.state).toBe('VERIFIED');
  act(() => result.current.setConsent(true));
  await act(async () => {
    await result.current.start();
  });
  expect(result.current.consent).toBe(true);
  await act(async () => {
    await result.current.preview();
  });
  expect(result.current.result?.state).toBe('RESTORED_TO_NEW_FOLDER');
  expect(localBackupApi.create).toHaveBeenCalledTimes(1);
  expect(localBackupApi.preview).toHaveBeenCalledTimes(1);
});
it('취소 뒤 늦은 진행률은 버리고 실제 작업 종료까지 잠금을 유지한다', async () => {
  let progress!: (job: JobSnapshot) => void;
  let finish!: (value: LocalBackupResult) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(localBackupApi.create).mockImplementation((current, update) => {
    signal = current;
    progress = update;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { result } = renderHook(useLocalBackup);
  act(() => result.current.setConsent(true));
  let work!: Promise<void>;
  act(() => {
    work = result.current.start();
  });
  const first: JobSnapshot = {
    schemaVersion: 1,
    jobId: crypto.randomUUID(),
    state: 'RUNNING',
    completedBytes: 10,
    totalBytes: 100,
    result: null,
    errorCode: null,
  };
  act(() => progress(first));
  expect(result.current.job).toBe(first);
  act(() => result.current.cancel());
  act(() => progress({ ...first, completedBytes: 99 }));
  expect(signal?.aborted).toBe(true);
  expect(result.current.job).toBe(first);
  expect(result.current.busy).toBe(true);
  await act(async () => {
    await result.current.start();
    await result.current.verify();
  });
  expect(localBackupApi.create).toHaveBeenCalledTimes(1);
  expect(localBackupApi.verify).not.toHaveBeenCalled();
  await act(async () => {
    finish(completed);
    await work;
  });
  expect(result.current.result).toBeNull();
  expect(result.current.busy).toBe(false);
  expect(result.current.consent).toBe(true);
});
