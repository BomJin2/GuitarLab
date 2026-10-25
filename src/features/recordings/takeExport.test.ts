import { invoke } from '@tauri-apps/api/core';
import { afterEach, expect, it, vi } from 'vitest';
import { recordingFixture } from '../../test/recordingFixture';
import { decodeTakeExport, takeExportApi, takeExportError } from './takeExport';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
function result() {
  const take = recordingFixture();
  return {
    schemaVersion: 1,
    state: 'RECORDING_EXPORTED',
    projectId: take.projectId,
    takeId: take.id,
    bytes: 58 + take.frames * 4,
    sha256: take.sha256,
  };
}
it('현재 원본의 정확한 길이·지문과 여섯 필드만 수용한다', () => {
  const take = recordingFixture();
  expect(decodeTakeExport(result(), take).bytes).toBe(768058);
  for (const patch of [
    { schemaVersion: 2 },
    { state: 'READY' },
    { projectId: take.id },
    { takeId: take.projectId },
    { bytes: true },
    { bytes: 256 * 1024 * 1024 + 1 },
    { bytes: 1 },
    { sha256: '0'.repeat(64) },
    { path: 'private' },
  ]) {
    expect(() => decodeTakeExport({ ...result(), ...patch }, take)).toThrow(
      'TAKE_EXPORT_CONTRACT_INVALID',
    );
  }
});
it('선택 ID만 요청하고 개인 경로·PCM을 받거나 반환하지 않는다', async () => {
  const take = recordingFixture();
  vi.mocked(invoke).mockResolvedValue({
    schemaVersion: 1,
    jobId: take.id,
    state: 'COMPLETED',
    completedBytes: 768058,
    totalBytes: 768058,
    result: result(),
    errorCode: null,
  });
  expect(
    await takeExportApi.export(
      take,
      new AbortController().signal,
      () => undefined,
    ),
  ).toEqual({ bytes: 768058, sha256: take.sha256 });
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_recording', {
    request: { schemaVersion: 1, projectId: take.projectId, takeId: take.id },
  });
});
it('불완전 상태·손상 입력·초기 취소는 파일 선택도 시작하지 않는다', async () => {
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    takeExportApi.export(recordingFixture(), aborted.signal, () => undefined),
  ).rejects.toMatchObject({ name: 'AbortError' });
  for (const take of [
    recordingFixture({ state: 'RECOVERABLE_ERROR' }),
    recordingFixture({ id: '../invalid' }),
  ]) {
    await expect(
      takeExportApi.export(take, new AbortController().signal, () => undefined),
    ).rejects.toThrow();
  }
  expect(invoke).not.toHaveBeenCalled();
});
it('취소는 native 정리가 끝날 때까지 기다리며 중복 선택 창을 열지 않는다', async () => {
  vi.useFakeTimers();
  const take = recordingFixture(),
    controller = new AbortController();
  const job = {
    schemaVersion: 1,
    jobId: take.id,
    state: 'RUNNING',
    completedBytes: 0,
    totalBytes: 768058,
    result: null,
    errorCode: null,
  };
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'export_recording') return job;
    if (command === 'cancel_storage_job') return undefined;
    return { ...job, state: 'CANCELED' };
  });
  let settled = false;
  const pending = takeExportApi
    .export(take, controller.signal, () => controller.abort())
    .catch((cause: unknown) => {
      settled = true;
      return cause;
    });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(150);
  expect(await pending).toMatchObject({ name: 'AbortError' });
  expect(invoke).toHaveBeenCalledWith('cancel_storage_job', {
    request: { schemaVersion: 1, jobId: take.id },
  });
});
it('충돌·공간 부족은 원문 경로 없이 안내한다', () => {
  expect(takeExportError({ code: 'EXPORT_DESTINATION_EXISTS' })).toContain(
    '새 WAV',
  );
  expect(takeExportError(new Error('DISK_SPACE_LOW'))).toContain('저장 공간');
  expect(takeExportError(new Error('C:/private/name.wav'))).not.toContain(
    'private',
  );
});
