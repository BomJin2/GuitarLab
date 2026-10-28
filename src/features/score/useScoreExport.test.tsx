import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useScoreExport } from './useScoreExport';
import { scoreExportApi } from './scoreExport';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import type { JobSnapshot } from '../library/projects';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('테스트 초기화');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('화면 이탈 뒤 이전 출력 명령을 실행하지 않는다', async () => {
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const output = vi
    .spyOn(scoreExportApi, 'export')
    .mockResolvedValue({ format: 'JSON', bytes: 100 });
  const initial = scoreEditingFixture();
  const hook = renderHook(() => useScoreExport(initial.document));
  const old = hook.result.current;
  hook.unmount();
  await act(async () => old.export(initial.document, 'JSON'));
  expect(output).not.toHaveBeenCalled();
});
it('같은 악보 문맥에 돌아와도 이전 출력 명령을 재사용하지 않는다', async () => {
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const output = vi
    .spyOn(scoreExportApi, 'export')
    .mockResolvedValue({ format: 'JSON', bytes: 100 });
  const initial = scoreEditingFixture();
  const hook = renderHook((source: object) => useScoreExport(source), {
    initialProps: initial.originalBytes,
  });
  const old = hook.result.current;
  hook.rerender(new Uint8Array(initial.originalBytes));
  hook.rerender(initial.originalBytes);
  await act(async () => old.export(initial.document, 'JSON'));
  expect(output).not.toHaveBeenCalled();
});
it('선택 악보 변경 뒤 실제 파일 작업 종료 전에는 새 출력을 시작하지 않는다', async () => {
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const pending = deferred<{ format: 'JSON'; bytes: number }>();
  const output = vi
    .spyOn(scoreExportApi, 'export')
    .mockReturnValueOnce(pending.promise);
  const initial = scoreEditingFixture();
  const hook = renderHook((source: object) => useScoreExport(source), {
    initialProps: initial.originalBytes,
  });
  let work: Promise<void> | undefined;
  act(() => {
    work = hook.result.current.export(initial.document, 'JSON');
  });
  hook.rerender(new Uint8Array(initial.originalBytes));
  expect(output.mock.calls[0]?.[2].aborted).toBe(true);
  expect(hook.result.current.busy).toBe(true);
  expect(hook.result.current.canceling).toBe(true);
  await act(async () => hook.result.current.export(initial.document, 'JSON'));
  expect(output).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve({ format: 'JSON', bytes: 100 });
    await work;
  });
  expect(hook.result.current.busy).toBe(false);
  expect(hook.result.current.notice).toBeNull();
});
it.each(['성공', '실패'] as const)(
  '악보 변경 첫 반환에 이전 진행·%s 안내를 숨긴다',
  async (outcome) => {
    vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
    const output = vi
      .spyOn(scoreExportApi, 'export')
      .mockImplementation(async (_, __, ___, report) => {
        const job: JobSnapshot = {
          schemaVersion: 1,
          jobId: '00000000-0000-4000-8000-000000000001',
          state: 'RUNNING',
          completedBytes: 50,
          totalBytes: 100,
          result: null,
          errorCode: null,
        };
        report(job);
        if (outcome === '실패') throw new Error('DISK_SPACE_LOW');
        return { format: 'JSON', bytes: 100 };
      });
    const initial = scoreEditingFixture();
    const seen: ReturnType<typeof useScoreExport>[] = [];
    const hook = renderHook(
      (source: object) => {
        const state = useScoreExport(source);
        seen.push(state);
        return state;
      },
      { initialProps: initial.originalBytes },
    );
    await act(async () => hook.result.current.export(initial.document, 'JSON'));
    expect(output).toHaveBeenCalledTimes(1);
    expect(hook.result.current.job).not.toBeNull();
    expect(
      hook.result.current.notice ?? hook.result.current.error,
    ).not.toBeNull();
    seen.length = 0;
    hook.rerender(new Uint8Array(initial.originalBytes));
    expect(
      seen.every(
        (state) =>
          state.job === null && state.notice === null && state.error === null,
      ),
    ).toBe(true);
  },
);
it('이전 활성 명령으로 현재 조작 잠금을 우회하지 않는다', async () => {
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const output = vi
    .spyOn(scoreExportApi, 'export')
    .mockResolvedValue({ format: 'JSON', bytes: 100 });
  const initial = scoreEditingFixture();
  const hook = renderHook(
    (enabled: boolean) => useScoreExport(initial.originalBytes, enabled),
    { initialProps: true },
  );
  const old = hook.result.current;
  hook.rerender(false);
  await act(async () => old.export(initial.document, 'JSON'));
  expect(output).not.toHaveBeenCalled();
  hook.rerender(true);
  await act(async () => hook.result.current.export(initial.document, 'JSON'));
  expect(output).toHaveBeenCalledTimes(1);
});
it('이전 취소 명령은 새 악보 출력을 중단하지 않는다', async () => {
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const pending = deferred<{ format: 'JSON'; bytes: number }>();
  const output = vi
    .spyOn(scoreExportApi, 'export')
    .mockReturnValueOnce(pending.promise);
  const initial = scoreEditingFixture();
  const hook = renderHook((source: object) => useScoreExport(source), {
    initialProps: initial.originalBytes,
  });
  const old = hook.result.current;
  hook.rerender(new Uint8Array(initial.originalBytes));
  let work: Promise<void> | undefined;
  act(() => {
    work = hook.result.current.export(initial.document, 'JSON');
  });
  act(() => old.cancel());
  expect(output.mock.calls[0]?.[2].aborted).toBe(false);
  await act(async () => {
    pending.resolve({ format: 'JSON', bytes: 100 });
    await work;
  });
  expect(hook.result.current.notice).toContain('새 JSON');
});
it('현재 native 사용 가능 여부도 실행 시점에 다시 확인한다', async () => {
  const available = vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const output = vi
    .spyOn(scoreExportApi, 'export')
    .mockResolvedValue({ format: 'JSON', bytes: 100 });
  const initial = scoreEditingFixture();
  const hook = renderHook(() => useScoreExport(initial.originalBytes));
  available.mockReturnValue(false);
  await act(async () => hook.result.current.export(initial.document, 'JSON'));
  expect(output).not.toHaveBeenCalled();
});
it('중복 출력을 막고 새 원본으로 이동하면 진행 중 작업과 늦은 결과를 폐기한다', async () => {
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const pending = deferred<{ format: 'JSON'; bytes: number }>();
  const exportFile = vi
    .spyOn(scoreExportApi, 'export')
    .mockReturnValueOnce(pending.promise)
    .mockRejectedValueOnce(new Error('EXPORT_IO'));
  const initial = scoreEditingFixture();
  const hook = renderHook(({ source }) => useScoreExport(source), {
    initialProps: { source: initial.originalBytes },
  });
  let first: Promise<void> | undefined;
  act(() => {
    first = hook.result.current.export(initial.document, 'JSON');
    void hook.result.current.export(initial.document, 'JSON');
  });
  expect(exportFile).toHaveBeenCalledTimes(1);
  expect(hook.result.current.busy).toBe(true);
  const signal = exportFile.mock.calls[0]?.[2];
  hook.rerender({ source: new Uint8Array(initial.originalBytes) });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    pending.resolve({ format: 'JSON', bytes: 100 });
    await first;
  });
  expect(hook.result.current.notice).toBeNull();
  expect(hook.result.current.busy).toBe(false);
  await act(async () => hook.result.current.export(initial.document, 'JSON'));
  expect(hook.result.current.error).toContain('출력하지 못했습니다');
  expect(hook.result.current.busy).toBe(false);
});
it('명시적 취소 뒤 늦게 완료된 파일을 성공 알림으로 위장하지 않고 재시도할 수 있다', async () => {
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const pending = deferred<{ format: 'JSON'; bytes: number }>();
  vi.spyOn(scoreExportApi, 'export')
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ format: 'JSON', bytes: 200 });
  const initial = scoreEditingFixture();
  const { result } = renderHook(() => useScoreExport(initial.originalBytes));
  let first: Promise<void> | undefined;
  act(() => {
    first = result.current.export(initial.document, 'JSON');
  });
  act(() => result.current.cancel());
  await act(async () => {
    pending.resolve({ format: 'JSON', bytes: 100 });
    await first;
  });
  expect(result.current.notice).toContain(
    '이미 저장된 파일은 유지될 수 있습니다',
  );
  await act(async () => result.current.export(initial.document, 'JSON'));
  expect(result.current.notice).toContain('새 JSON 파일로 저장했습니다');
});
