import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useScoreExport } from './useScoreExport';
import { scoreExportApi } from './scoreExport';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';

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
