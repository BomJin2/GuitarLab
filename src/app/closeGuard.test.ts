import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { closeGuardApi, closeIntent } from './closeGuard';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
const id = '00000000-0000-4000-8000-000000000001';
beforeEach(() => vi.clearAllMocks());
it('경로·버전·잘못된 종료 이벤트와 응답을 거부한다', async () => {
  expect(closeIntent({ schemaVersion: 1, requestId: id })).toBe(id);
  for (const value of [
    null,
    {},
    { schemaVersion: 2, requestId: id },
    { schemaVersion: 1, requestId: 'bad' },
    { schemaVersion: 1, requestId: id, path: 'private' },
  ]) {
    expect(() => closeIntent(value)).toThrow('CLOSE_CONTRACT_INVALID');
  }
  for (const value of [
    null,
    { schemaVersion: 2, state: 'ENABLED' },
    { schemaVersion: 1, state: 'CLOSE_REQUESTED' },
    { schemaVersion: 1, state: 'ENABLED', path: 'private' },
  ]) {
    vi.mocked(invoke).mockResolvedValueOnce(value);
    await expect(closeGuardApi.enable()).rejects.toThrow(
      'CLOSE_CONTRACT_INVALID',
    );
  }
});
it('정확한 버전·현재 UUID·미저장 상태만 전달하고 native 오류는 전파한다', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    state: 'ENABLED',
  });
  await closeGuardApi.enable();
  expect(invoke).toHaveBeenLastCalledWith('enable_close_guard', {
    request: { schemaVersion: 1 },
  });
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    state: 'CONFIRMING',
  });
  await closeGuardApi.resolve(id, true);
  expect(invoke).toHaveBeenLastCalledWith('resolve_close_request', {
    request: { schemaVersion: 1, requestId: id, hasUnsavedScore: true },
  });
  vi.mocked(invoke).mockRejectedValueOnce(new Error('CLOSE_REQUEST_EXPIRED'));
  await expect(closeGuardApi.resolve(id, false)).rejects.toThrow(
    'CLOSE_REQUEST_EXPIRED',
  );
});
