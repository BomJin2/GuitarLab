import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { recordFixture } from '../../test/projectFixture';
import { recordApi, type StoredEvent } from './records';
import { usePracticeEvents } from './usePracticeEvents';

vi.mock('./records', () => ({ recordApi: { events: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

function pendingRead() {
  let resolve!: (events: StoredEvent[]) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<StoredEvent[]>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it('선택 전에는 조회하지 않고 읽는 동안만 실제 진행률을 반환한다', async () => {
  const pending = pendingRead();
  vi.mocked(recordApi.events).mockReturnValue(pending.promise);
  const record = recordFixture();
  const { result, rerender } = renderHook(usePracticeEvents, {
    initialProps: undefined as ReturnType<typeof recordFixture> | undefined,
  });
  expect(result.current.status).toBe('IDLE');
  expect(recordApi.events).not.toHaveBeenCalled();
  rerender(record);
  act(() => vi.mocked(recordApi.events).mock.calls[0]?.[2](1, 2));
  expect(result.current.status).toBe('LOADING');
  expect(result.current.loaded).toBe(1);
  await act(async () => pending.resolve([]));
  expect(result.current.status).toBe('READY');
});

it('같은 시도로 돌아와도 이전 완료·오류·진행률과 명령을 버린다', async () => {
  const first = recordFixture();
  const second = { ...recordFixture(), attemptId: 'second' };
  const old = pendingRead();
  const other = pendingRead();
  const current = pendingRead();
  vi.mocked(recordApi.events)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(other.promise)
    .mockReturnValueOnce(current.promise);
  const { result, rerender } = renderHook(usePracticeEvents, {
    initialProps: first,
  });
  const oldActions = result.current;
  const oldCall = vi.mocked(recordApi.events).mock.calls[0];
  rerender(second);
  const otherCall = vi.mocked(recordApi.events).mock.calls[1];
  expect(oldCall?.[1].aborted).toBe(true);
  rerender(first);
  const currentCall = vi.mocked(recordApi.events).mock.calls[2];
  expect(otherCall?.[1].aborted).toBe(true);
  act(() => {
    oldActions.cancel();
    oldActions.retry();
    oldCall?.[2](90, 100);
  });
  await act(async () => {
    old.resolve([]);
    other.reject({ code: 'STORAGE_ERROR' });
  });
  expect(currentCall?.[1].aborted).toBe(false);
  expect(recordApi.events).toHaveBeenCalledTimes(3);
  expect(result.current.status).toBe('LOADING');
  expect(result.current.loaded).toBe(0);
  expect(result.current.error).toBeNull();
  await act(async () => current.resolve([]));
  expect(result.current.status).toBe('READY');
});

it('실패한 이전 조회의 재시도 명령으로 새 시도를 다시 읽지 않는다', async () => {
  const old = pendingRead();
  const current = pendingRead();
  vi.mocked(recordApi.events)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(current.promise);
  const { result, rerender } = renderHook(usePracticeEvents, {
    initialProps: recordFixture(),
  });
  await act(async () => old.reject({ code: 'STORAGE_ERROR' }));
  expect(result.current.status).toBe('ERROR');
  const retry = result.current.retry;
  rerender({ ...recordFixture(), attemptId: 'second' });
  act(retry);
  expect(recordApi.events).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe('LOADING');
  await act(async () => current.resolve([]));
});

it('재시도 후 이전 조회가 늦게 끝나도 새 결과를 덮지 않는다', async () => {
  const old = pendingRead();
  const current = pendingRead();
  vi.mocked(recordApi.events)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(current.promise);
  const { result } = renderHook(usePracticeEvents, {
    initialProps: recordFixture(),
  });
  act(() => result.current.cancel());
  act(() => result.current.retry());
  const values = recordFixture().snapshot.events.map((event) => ({
    sequence: event.sequence,
    measureIndex: 3,
    event,
  }));
  await act(async () => current.resolve(values));
  await act(async () => old.resolve([]));
  expect(result.current.status).toBe('READY');
  expect(result.current.events).toBe(values);
});

it('이탈 시 조회를 취소하고 보관된 명령이 외부 작업을 시작하지 않는다', async () => {
  const pending = pendingRead();
  vi.mocked(recordApi.events).mockReturnValue(pending.promise);
  const { result, unmount } = renderHook(usePracticeEvents, {
    initialProps: recordFixture(),
  });
  act(() => result.current.cancel());
  const previous = result.current;
  unmount();
  act(() => {
    previous.retry();
    previous.cancel();
  });
  expect(recordApi.events).toHaveBeenCalledTimes(1);
  expect(vi.mocked(recordApi.events).mock.calls[0]?.[1].aborted).toBe(true);
  await act(async () => pending.reject(new Error('late')));
});
