import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelCacheApi, type ModelCacheInfo } from './modelCache';
import { modelSetupApi, type ModelSetupResult } from './modelSetup';
import { modelInstallationApi } from './modelInstallation';
import { cacheCleanupApi, type CacheUsage } from './cacheCleanup';
import { useModelDownload } from './useModelDownload';
import { useModelSetup } from './useModelSetup';
import { useModelInstallation } from './useModelInstallation';
import { useCacheCleanup } from './useCacheCleanup';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock('./modelCache', async (original) => ({
  ...(await original<typeof import('./modelCache')>()),
  modelCacheApi: { available: () => true, download: vi.fn() },
}));
vi.mock('./modelSetup', async (original) => ({
  ...(await original<typeof import('./modelSetup')>()),
  modelSetupApi: { available: () => true, install: vi.fn() },
}));
vi.mock('./modelInstallation', async (original) => ({
  ...(await original<typeof import('./modelInstallation')>()),
  modelInstallationApi: { available: () => true, verify: vi.fn() },
}));
vi.mock('./cacheCleanup', async (original) => ({
  ...(await original<typeof import('./cacheCleanup')>()),
  cacheCleanupApi: { available: () => true, inspect: vi.fn(), clear: vi.fn() },
}));

const cache: ModelCacheInfo = {
  schemaVersion: 1,
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  state: 'CACHE_VERIFIED',
  artifactCount: 41,
  totalBytes: 144366287,
  reusedFiles: 0,
};
const installed: ModelSetupResult = {
  schemaVersion: 1,
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  environmentId: '12345678-1234-4234-8234-123456789012',
  state: 'INSTALLED',
  selfTest: 'OWNED_8_NOTES_PASSED',
};
const usage: CacheUsage = {
  schemaVersion: 1,
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  state: 'CACHE_USAGE',
  profile: 'CP312_DOWNLOADS',
  files: 3,
  bytes: 1024,
  revision: 'a'.repeat(64),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(modelCacheApi.download).mockResolvedValue(cache);
  vi.mocked(modelSetupApi.install).mockResolvedValue(installed);
  vi.mocked(modelInstallationApi.verify).mockResolvedValue({
    schemaVersion: 1,
    modelId: 'basic-pitch',
    modelVersion: '0.4.0',
    state: 'FILES_VERIFIED',
    pythonVersion: '3.12.15',
  });
  vi.mocked(cacheCleanupApi.inspect).mockResolvedValue(usage);
  vi.mocked(cacheCleanupApi.clear).mockResolvedValue({
    schemaVersion: 1,
    modelId: 'basic-pitch',
    modelVersion: '0.4.0',
    state: 'CACHE_CLEARED',
    profile: 'CP312_DOWNLOADS',
    removedFiles: 3,
    removedBytes: 1024,
    installedEnvironmentsChanged: false,
  });
});
afterEach(cleanup);

function useManagement() {
  const download = useModelDownload();
  const setup = useModelSetup();
  const verification = useModelInstallation();
  const cleanup = useCacheCleanup();
  return {
    download: {
      start: download.download,
      select: download.selectModel,
      consent: download.setConsent,
      cancel: download.cancel,
      completed: !!download.result,
    },
    setup: {
      start: setup.install,
      select: setup.selectModel,
      consent: () => undefined,
      cancel: setup.cancel,
      completed: !!setup.result,
    },
    verification: {
      start: verification.verify,
      select: verification.select,
      consent: () => undefined,
      cancel: verification.cancel,
      completed: !!verification.result,
    },
    cleanup: {
      start: cleanup.inspect,
      select: cleanup.selectModel,
      consent: cleanup.setConsent,
      cancel: cleanup.cancel,
      completed: !!cleanup.usage,
    },
  };
}
const operations = ['download', 'setup', 'verification', 'cleanup'] as const;
const call = {
  download: modelCacheApi.download,
  setup: modelSetupApi.install,
  verification: modelInstallationApi.verify,
  cleanup: cacheCleanupApi.inspect,
};
it.each(operations)(
  '%s: 모델 변경과 같은 이벤트 안에서도 예전 명령을 시작하지 않는다',
  async (name) => {
    const { result } = renderHook(useManagement);
    const old = result.current[name];
    let work!: Promise<void>;
    act(() => {
      old.select('htdemucs_6s');
      old.consent(true);
      work = old.start();
    });
    await act(async () => {
      await work;
    });
    expect(call[name]).not.toHaveBeenCalled();
  },
);
it.each(operations)(
  '%s: 이전 취소는 현재 모델 작업의 완료를 막지 않는다',
  async (name) => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const hold = async <T,>(value: T) => {
      await pending;
      return value;
    };
    vi.mocked(modelCacheApi.download).mockImplementation(() => hold(cache));
    vi.mocked(modelSetupApi.install).mockImplementation(() => hold(installed));
    vi.mocked(modelInstallationApi.verify).mockImplementation(() =>
      hold({
        schemaVersion: 1,
        modelId: 'basic-pitch',
        modelVersion: '0.4.0',
        state: 'FILES_VERIFIED',
        pythonVersion: '3.12.15',
      }),
    );
    vi.mocked(cacheCleanupApi.inspect).mockImplementation(() => hold(usage));
    const { result } = renderHook(useManagement);
    const oldCancel = result.current[name].cancel;
    act(() => result.current[name].select('htdemucs_6s'));
    act(() => result.current[name].select('basic-pitch'));
    act(() => result.current[name].consent(true));
    let work!: Promise<void>;
    act(() => {
      work = result.current[name].start();
    });
    act(oldCancel);
    await act(async () => {
      finish();
      await work;
    });
    expect(result.current[name].completed).toBe(true);
    expect(call[name]).toHaveBeenCalledTimes(1);
  },
);
it.each(operations)(
  '%s: 같은 모델로 돌아와도 이전 명령은 실행하지 않는다',
  async (name) => {
    const { result } = renderHook(useManagement);
    act(() => result.current[name].consent(true));
    const old = result.current[name];
    act(() => result.current[name].select('htdemucs_6s'));
    act(() => result.current[name].select('basic-pitch'));
    await act(async () => {
      await old.start();
    });
    expect(call[name]).not.toHaveBeenCalled();
  },
);
it.each(operations)(
  '%s: 화면 이탈 뒤 이전 명령은 외부 작업을 시작하지 않는다',
  async (name) => {
    const { result, unmount } = renderHook(useManagement);
    act(() => result.current[name].consent(true));
    const old = result.current[name];
    unmount();
    await act(async () => {
      await old.start();
    });
    expect(call[name]).not.toHaveBeenCalled();
  },
);
it('다운로드 동의를 해제하면 이전 동의 함수로 실행하지 않는다', async () => {
  const { result } = renderHook(useModelDownload);
  act(() => result.current.setConsent(true));
  const old = result.current.download;
  act(() => result.current.setConsent(false));
  await act(async () => {
    await old();
  });
  expect(modelCacheApi.download).not.toHaveBeenCalled();
});
it('소비한 다운로드 동의는 예전 함수로 다시 사용하지 않는다', async () => {
  const { result } = renderHook(useModelDownload);
  act(() => result.current.setConsent(true));
  const old = result.current.download;
  await act(async () => {
    await old();
    await old();
  });
  expect(modelCacheApi.download).toHaveBeenCalledTimes(1);
});
it('이전 모델의 동의 함수는 새 모델의 다운로드를 허용하지 않는다', async () => {
  const { result } = renderHook(useModelDownload);
  const oldConsent = result.current.setConsent;
  act(() => result.current.selectModel('htdemucs_6s'));
  act(() => oldConsent(true));
  await act(async () => {
    await result.current.download();
  });
  expect(result.current.consent).toBe(false);
  expect(modelCacheApi.download).not.toHaveBeenCalled();
});
it('캐시 삭제 동의를 해제하면 이전 삭제 함수로 지우지 않는다', async () => {
  const { result } = renderHook(useCacheCleanup);
  await act(async () => {
    await result.current.inspect();
  });
  act(() => result.current.setConsent(true));
  const oldClear = result.current.clear;
  act(() => result.current.setConsent(false));
  await act(async () => {
    await oldClear();
  });
  expect(cacheCleanupApi.clear).not.toHaveBeenCalled();
});
it('소비한 캐시 삭제 동의를 예전 함수로 재사용하지 않는다', async () => {
  const { result } = renderHook(useCacheCleanup);
  await act(async () => {
    await result.current.inspect();
  });
  act(() => result.current.setConsent(true));
  const oldClear = result.current.clear;
  await act(async () => {
    await oldClear();
    await oldClear();
  });
  expect(cacheCleanupApi.clear).toHaveBeenCalledTimes(1);
});
it('캐시 재조회는 이전 동의를 지우고 새 동의로 최신 revision만 전달한다', async () => {
  const { result } = renderHook(useCacheCleanup);
  await act(async () => {
    await result.current.inspect();
  });
  act(() => result.current.setConsent(true));
  const old = result.current;
  const latest = { ...usage, revision: 'b'.repeat(64) };
  vi.mocked(cacheCleanupApi.inspect).mockResolvedValue(latest);
  await act(async () => {
    await result.current.inspect();
    await old.clear();
  });
  expect(cacheCleanupApi.clear).not.toHaveBeenCalled();
  act(() => result.current.setConsent(true));
  await act(async () => {
    await old.clear();
  });
  expect(cacheCleanupApi.clear).toHaveBeenCalledWith(
    latest,
    expect.any(AbortSignal),
    expect.any(Function),
  );
});
it('이전 캐시 모델의 동의와 삭제 함수는 새 선택·화면 이탈 뒤 사용하지 않는다', async () => {
  const { result, unmount } = renderHook(useCacheCleanup);
  await act(async () => {
    await result.current.inspect();
  });
  act(() => result.current.setConsent(true));
  const old = result.current;
  act(() => result.current.selectModel('htdemucs_6s'));
  act(() => old.setConsent(true));
  expect(result.current.consent).toBe(false);
  unmount();
  await act(async () => {
    await old.clear();
  });
  expect(cacheCleanupApi.clear).not.toHaveBeenCalled();
});
