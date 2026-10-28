import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { scoreExportApi } from './scoreExport';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it.each(['CANCELED', 'COMPLETED', 'ERROR'] as const)(
  '취소 요청 뒤에도 native %s까지 확인하고 중간에 끝내지 않는다',
  async (terminal) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const base = {
      schemaVersion: 1,
      jobId: '00000000-0000-4000-8000-000000000001',
      state: 'RUNNING',
      completedBytes: 0,
      totalBytes: 100,
      errorCode: null,
      result: null,
    };
    let polls = 0;
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'export_score_file') return base;
      if (command === 'cancel_storage_job') return null;
      if (command !== 'get_storage_job') throw new Error('예상하지 못한 명령');
      return {
        ...base,
        state: ++polls === 1 ? 'CANCELING' : terminal,
        errorCode: terminal === 'ERROR' ? 'EXPORT_IO' : null,
        result:
          terminal === 'COMPLETED'
            ? { schemaVersion: 1, format: 'JSON', bytes: 100 }
            : null,
      };
    });
    const report = vi.fn();
    let settled = false;
    const result = scoreExportApi
      .export(scoreEditingFixture().document, 'JSON', controller.signal, report)
      .then(
        (value) => {
          settled = true;
          return { value, cause: null };
        },
        (cause: unknown) => {
          settled = true;
          return { value: null, cause };
        },
      );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(150);
    expect(settled).toBe(false);
    expect(invoke).toHaveBeenCalledWith('cancel_storage_job', {
      request: { schemaVersion: 1, jobId: base.jobId },
    });
    await vi.advanceTimersByTimeAsync(150);
    const outcome = await result;
    expect(settled).toBe(true);
    expect(report.mock.calls.some(([job]) => job.state === 'CANCELING')).toBe(
      true,
    );
    if (terminal === 'COMPLETED')
      expect(outcome.value).toEqual({ format: 'JSON', bytes: 100 });
    else if (terminal === 'CANCELED')
      expect(outcome.cause).toMatchObject({ name: 'AbortError' });
    else expect(outcome.cause).toEqual(new Error('EXPORT_IO'));
  },
);
