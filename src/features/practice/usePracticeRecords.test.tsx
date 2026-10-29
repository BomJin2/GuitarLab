import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { recordFixture } from '../../test/projectFixture';
import { recordApi, type StoredAttempt } from './records';
import { usePracticeRecords } from './usePracticeRecords';

vi.mock('./records', () => ({ recordApi: { list: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

function pendingList() {
  let resolve!: (records: StoredAttempt[]) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<StoredAttempt[]>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it('데스크톱이 아니거나 프로젝트가 없으면 읽지 않고 대기 상태를 끝낸다', async () => {
  const pending = pendingList();
  vi.mocked(recordApi.list).mockReturnValue(pending.promise);
  const { result, rerender } = renderHook(
    ({ native, id }) => usePracticeRecords(native, id),
    { initialProps: { native: false, id: 'project' } },
  );
  expect(result.current.busy).toBe(false);
  expect(recordApi.list).not.toHaveBeenCalled();
  rerender({ native: true, id: '' });
  expect(result.current.busy).toBe(false);
  expect(recordApi.list).not.toHaveBeenCalled();
  rerender({ native: true, id: 'project' });
  expect(result.current.busy).toBe(true);
  rerender({ native: false, id: 'project' });
  expect(vi.mocked(recordApi.list).mock.calls[0]?.[1].aborted).toBe(true);
  await act(async () => pending.reject({ code: 'STORAGE_ERROR' }));
  expect(result.current.busy).toBe(false);
  expect(result.current.error).toBeNull();
});

it('이전 프로젝트의 늦은 응답은 현재 목록과 대기 상태를 바꾸지 않는다', async () => {
  const old = pendingList();
  const current = pendingList();
  vi.mocked(recordApi.list)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(current.promise);
  const { result, rerender } = renderHook(
    (id) => usePracticeRecords(true, id),
    { initialProps: 'first' },
  );
  rerender('second');
  expect(vi.mocked(recordApi.list).mock.calls[0]?.[1].aborted).toBe(true);
  await act(async () => old.resolve([recordFixture()]));
  expect(result.current.records).toEqual([]);
  expect(result.current.busy).toBe(true);
  const second = { ...recordFixture(), projectId: 'second' };
  await act(async () => current.resolve([second]));
  expect(result.current.records).toEqual([second]);
  expect(result.current.busy).toBe(false);
});

it('목록 오류를 보존하고 명시적 새로고침으로 같은 프로젝트를 재시도한다', async () => {
  const record = recordFixture();
  vi.mocked(recordApi.list)
    .mockRejectedValueOnce({ code: 'STORAGE_ERROR' })
    .mockResolvedValueOnce([record]);
  const { result } = renderHook(() =>
    usePracticeRecords(true, record.projectId),
  );
  await act(async () => undefined);
  expect(result.current.error).toContain('현재 상태');
  expect(result.current.busy).toBe(false);
  act(() => result.current.refresh());
  expect(result.current.error).toBeNull();
  await act(async () => undefined);
  expect(result.current.records).toEqual([record]);
  expect(recordApi.list).toHaveBeenCalledTimes(2);
});

it('화면 이탈 뒤의 응답과 오류를 적용하지 않는다', async () => {
  const pending = pendingList();
  vi.mocked(recordApi.list).mockReturnValue(pending.promise);
  const { unmount } = renderHook(() => usePracticeRecords(true, 'project'));
  unmount();
  expect(vi.mocked(recordApi.list).mock.calls[0]?.[1].aborted).toBe(true);
  await act(async () => pending.reject({ code: 'STORAGE_ERROR' }));
  expect(recordApi.list).toHaveBeenCalledTimes(1);
});
