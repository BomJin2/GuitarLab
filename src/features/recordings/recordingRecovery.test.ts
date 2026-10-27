import { invoke } from '@tauri-apps/api/core';
import { afterEach, expect, it, vi } from 'vitest';
import { recordingFixture } from '../../test/recordingFixture';
import { recordingApi } from './recordings';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
it('복구 취소를 요청해도 native의 실제 종료까지 기다린다', async () => {
  vi.useFakeTimers();
  const take = recordingFixture(),
    controller = new AbortController();
  const job = {
    schemaVersion: 1,
    jobId: take.id,
    state: 'RUNNING',
    completedBytes: 0,
    totalBytes: 100,
    result: null,
    errorCode: null,
  };
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'recover_recording') return job;
    if (command === 'cancel_storage_job') return undefined;
    return { ...job, state: 'CANCELED' };
  });
  let settled = false;
  const pending = recordingApi
    .recover(take.projectId, take.id, controller.signal, () =>
      controller.abort(),
    )
    .catch((cause: unknown) => {
      settled = true;
      return cause;
    });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(150);
  expect(await pending).toMatchObject({ name: 'AbortError' });
  expect(invoke).toHaveBeenCalledWith('get_storage_job', {
    request: { schemaVersion: 1, jobId: take.id },
  });
});
