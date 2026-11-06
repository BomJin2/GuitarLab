import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { runStorageByteJob, runStorageJob } from './projects';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.resetAllMocks());

const ids: Record<string, string> = {
  first: '00000000-0000-4000-8000-0000000000a1',
  second: '00000000-0000-4000-8000-0000000000a2',
  third: '00000000-0000-4000-8000-0000000000a3',
};
const completed = (jobId: string) => ({
  schemaVersion: 1,
  jobId,
  state: 'COMPLETED',
  completedBytes: 1,
  totalBytes: 1,
  result: { schemaVersion: 1 },
  errorCode: null,
});

// 네이티브는 현재 작업 하나만 기억해, 회수 전에 다음 작업이 시작되면 앞 결과를 잃습니다(JOB_NOT_FOUND).
it('저장소 작업은 바이트 회수까지 끝난 뒤에 다음 작업을 시작하고, 기다리다 취소된 작업은 시작하지 않는다', async () => {
  const calls: string[] = [];
  let releaseFirstTake = () => {};
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    const jobId = (args as { request?: { jobId?: string } })?.request?.jobId;
    calls.push(jobId ? `${command}:${jobId.slice(-2)}` : command);
    if (command === 'take_storage_bytes') {
      if (jobId === ids.first)
        await new Promise<void>((resolve) => (releaseFirstTake = resolve));
      return new ArrayBuffer(1);
    }
    return completed(ids[command]!);
  });
  const first = runStorageByteJob(
    'first',
    {},
    new AbortController().signal,
    () => {},
  );
  const waiting = new AbortController();
  const second = runStorageJob('second', {}, waiting.signal, () => {});
  const third = runStorageByteJob(
    'third',
    {},
    new AbortController().signal,
    () => {},
  );
  await vi.waitFor(() => expect(calls).toContain('take_storage_bytes:a1'));
  // 첫 작업의 바이트 회수가 끝나기 전에는 다음 작업을 시작하지 않습니다.
  expect(calls).toEqual(['first', 'take_storage_bytes:a1']);
  waiting.abort();
  await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  expect(calls).toEqual(['first', 'take_storage_bytes:a1']);
  releaseFirstTake();
  await expect(first).resolves.toMatchObject({
    bytes: expect.any(ArrayBuffer),
  });
  await expect(third).resolves.toMatchObject({
    bytes: expect.any(ArrayBuffer),
  });
  expect(calls).toEqual([
    'first',
    'take_storage_bytes:a1',
    'third',
    'take_storage_bytes:a3',
  ]);
});

it('실행 중 작업을 취소하면 호출한 쪽은 바로 취소되고, 다음 작업은 네이티브 취소가 끝난 뒤 시작한다', async () => {
  vi.useFakeTimers();
  try {
    const calls: string[] = [];
    let polls = 0;
    const snapshot = (jobId: string, state: string) => ({
      ...completed(jobId),
      state,
      result: state === 'COMPLETED' ? { schemaVersion: 1 } : null,
    });
    vi.mocked(invoke).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'first') return snapshot(ids.first!, 'RUNNING');
      if (command === 'cancel_storage_job')
        return snapshot(ids.first!, 'CANCELING');
      if (command === 'get_storage_job')
        // 네이티브는 두 번 폴링할 때까지 취소 중입니다.
        return snapshot(ids.first!, ++polls < 3 ? 'CANCELING' : 'CANCELED');
      return completed(ids[command]!);
    });
    const controller = new AbortController();
    const first = runStorageJob('first', {}, controller.signal, () => {});
    const second = runStorageJob(
      'second',
      {},
      new AbortController().signal,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    // 호출한 쪽은 이미 취소됐지만, 네이티브가 아직 취소 중이라 다음 작업은 시작하지 않습니다.
    expect(calls).not.toContain('second');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(second).resolves.toEqual({ schemaVersion: 1 });
    expect(calls.indexOf('second')).toBeGreaterThan(
      calls.lastIndexOf('get_storage_job'),
    );
  } finally {
    vi.useRealTimers();
  }
});
