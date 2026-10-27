import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { recordingFixture } from '../../test/recordingFixture';
import { recordingApi, type RecordedTake } from './recordings';
import { useRecordedTakes } from './useRecordedTakes';

vi.mock('./recordings', async (original) => ({
  ...(await original<typeof import('./recordings')>()),
  recordingApi: { list: vi.fn(), update: vi.fn(), recover: vi.fn() },
}));
const take = recordingFixture({ state: 'RECOVERABLE_ERROR' });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(recordingApi.list).mockResolvedValue([take]);
  vi.mocked(recordingApi.update).mockResolvedValue(take);
  vi.mocked(recordingApi.recover).mockResolvedValue(
    recordingFixture({
      id: '00000000-0000-4000-8000-000000000009',
      recoveredFrom: take.id,
    }),
  );
});
afterEach(cleanup);

it('프로젝트 변경의 첫 반환부터 이전 목록을 숨긴다', async () => {
  const seen: ReturnType<typeof useRecordedTakes>[] = [];
  const hook = renderHook(
    (projectId: string | undefined) => {
      const state = useRecordedTakes(projectId);
      seen.push(state);
      return state;
    },
    { initialProps: take.projectId },
  );
  await waitFor(() => expect(hook.result.current.takes).toEqual([take]));
  seen.length = 0;
  vi.mocked(recordingApi.list).mockImplementation(
    () => new Promise(() => undefined),
  );
  hook.rerender(crypto.randomUUID());
  expect(seen.length).toBeGreaterThan(0);
  expect(
    seen.every(
      (state) =>
        state.takes.length === 0 && state.error === null && state.job === null,
    ),
  ).toBe(true);
});
it('같은 프로젝트 복귀 뒤 이전 조회·복구·정보 수정은 실행하지 않는다', async () => {
  const hook = renderHook(
    (projectId: string | undefined) => useRecordedTakes(projectId),
    { initialProps: take.projectId },
  );
  await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
  const old = hook.result.current;
  hook.rerender(undefined);
  hook.rerender(take.projectId);
  await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
  const reads = vi.mocked(recordingApi.list).mock.calls.length;
  await act(async () => {
    await old.refresh();
    await old.recover(take);
    await old.update(take, '이름', '', 0);
  });
  expect(recordingApi.list).toHaveBeenCalledTimes(reads);
  expect(recordingApi.recover).not.toHaveBeenCalled();
  expect(recordingApi.update).not.toHaveBeenCalled();
});
it('화면 이탈 뒤 보관된 명령은 파일 조회·수정·복구를 시작하지 않는다', async () => {
  const hook = renderHook(() => useRecordedTakes(take.projectId));
  await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
  const old = hook.result.current;
  hook.unmount();
  const reads = vi.mocked(recordingApi.list).mock.calls.length;
  await act(async () => {
    await old.refresh();
    await old.update(take, '이름', '', 0);
    await old.recover(take);
  });
  expect(recordingApi.list).toHaveBeenCalledTimes(reads);
  expect(recordingApi.update).not.toHaveBeenCalled();
  expect(recordingApi.recover).not.toHaveBeenCalled();
});
it('현재 잠금을 이전 활성 명령으로 우회하지 않는다', async () => {
  const hook = renderHook(
    (locked: boolean) => useRecordedTakes(take.projectId, locked),
    { initialProps: false },
  );
  await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
  const old = hook.result.current;
  hook.rerender(true);
  await act(async () => {
    await old.update(take, '이름', '', 0);
    await old.recover(take);
  });
  expect(recordingApi.update).not.toHaveBeenCalled();
  expect(recordingApi.recover).not.toHaveBeenCalled();
});
it.each(['다른 프로젝트', '목록에 없음'])(
  '%s 테이크를 수정하거나 복구하지 않는다',
  async (kind) => {
    const hook = renderHook(() => useRecordedTakes(take.projectId));
    await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
    const invalid =
      kind === '다른 프로젝트'
        ? { ...take, projectId: crypto.randomUUID() }
        : { ...take, id: crypto.randomUUID() };
    await act(async () => {
      await hook.result.current.update(invalid, '이름', '', 0);
      await hook.result.current.recover(invalid);
    });
    expect(recordingApi.update).not.toHaveBeenCalled();
    expect(recordingApi.recover).not.toHaveBeenCalled();
  },
);
it('정보 저장과 복구를 겹쳐 시작하지 않는다', async () => {
  let finish!: (value: RecordedTake) => void;
  vi.mocked(recordingApi.update).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useRecordedTakes(take.projectId));
  await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.update(take, '이름', '', 0);
  });
  await act(async () => {
    await hook.result.current.recover(take);
  });
  const overlapping = vi.mocked(recordingApi.recover).mock.calls.length;
  await act(async () => {
    finish(take);
    await pending;
  });
  expect(overlapping).toBe(0);
});
it('프로젝트 전환 뒤 이전 저장 오류는 새 프로젝트에 표시하지 않는다', async () => {
  let fail!: (cause: Error) => void;
  vi.mocked(recordingApi.update).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const hook = renderHook(
    (projectId: string | undefined) => useRecordedTakes(projectId),
    { initialProps: take.projectId },
  );
  await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.update(take, '이름', '', 0);
  });
  vi.mocked(recordingApi.list).mockResolvedValue([]);
  hook.rerender(crypto.randomUUID());
  await act(async () => {
    fail(new Error('DISK_SPACE_LOW'));
    await pending;
  });
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.takes).toEqual([]);
});
it('현재 목록에 없는 외부 프로젝트 응답은 표시하지 않는다', async () => {
  vi.mocked(recordingApi.list).mockResolvedValue([
    { ...take, projectId: crypto.randomUUID() },
  ]);
  const hook = renderHook(() => useRecordedTakes(take.projectId));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  expect(hook.result.current.takes).toEqual([]);
  expect(hook.result.current.error).toBeTruthy();
});
it('현재 테이크 정보 저장 후 목록을 갱신하고 원본 객체를 변경하지 않는다', async () => {
  const original = JSON.stringify(take);
  const saved = {
    ...take,
    name: '바꾼 이름',
    memo: '연습 메모',
    alignmentOffsetMs: 30,
  };
  const hook = renderHook(() => useRecordedTakes(take.projectId));
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  vi.mocked(recordingApi.update).mockResolvedValue(saved);
  vi.mocked(recordingApi.list).mockResolvedValue([saved]);
  await act(async () => {
    await hook.result.current.update(
      take,
      saved.name,
      saved.memo,
      saved.alignmentOffsetMs,
    );
  });
  expect(recordingApi.update).toHaveBeenCalledWith(
    take,
    saved.name,
    saved.memo,
    30,
  );
  expect(hook.result.current.takes).toEqual([saved]);
  expect(hook.result.current.notice).toContain('저장했습니다');
  expect(JSON.stringify(take)).toBe(original);
});
it('목록 취소 뒤 늦은 결과를 버리고 새 조회만 표시한다', async () => {
  let finish!: (value: RecordedTake[]) => void;
  vi.mocked(recordingApi.list).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useRecordedTakes(take.projectId));
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(recordingApi.list).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.cancel());
  expect(hook.result.current.loaded).toBe(false);
  expect(hook.result.current.busy).toBe(false);
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.takes).toEqual([take]);
  await act(async () => {
    finish([]);
  });
  expect(hook.result.current.takes).toEqual([take]);
});
it('취소 후 종료까지 중복을 막고 실제 복구 오류를 숨기지 않는다', async () => {
  let fail!: (cause: Error) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(recordingApi.recover).mockImplementation(
    (_projectId, _takeId, current) => {
      signal = current;
      return new Promise((_resolve, reject) => {
        fail = reject;
      });
    },
  );
  const hook = renderHook(() => useRecordedTakes(take.projectId));
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  let work!: Promise<void>;
  act(() => {
    work = hook.result.current.recover(take);
  });
  act(() => hook.result.current.cancel());
  expect(signal?.aborted).toBe(true);
  expect(hook.result.current.busy).toBe(true);
  expect(hook.result.current.canceling).toBe(true);
  await act(async () => {
    await hook.result.current.recover(take);
    await hook.result.current.update(take, '이름', '', 0);
    await hook.result.current.refresh();
  });
  expect(recordingApi.recover).toHaveBeenCalledTimes(1);
  expect(recordingApi.update).not.toHaveBeenCalled();
  expect(recordingApi.list).toHaveBeenCalledTimes(1);
  await act(async () => {
    fail(new Error('DISK_SPACE_LOW'));
    await work;
  });
  expect(hook.result.current.error).toContain('여유가 부족');
  expect(hook.result.current.busy).toBe(false);
  expect(hook.result.current.canceling).toBe(false);
});
it('취소와 경합해 이미 완료한 복구본은 보존하고 목록을 갱신한다', async () => {
  let finish!: (value: RecordedTake) => void;
  const recovered = recordingFixture({
    id: crypto.randomUUID(),
    recoveredFrom: take.id,
  });
  vi.mocked(recordingApi.recover).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useRecordedTakes(take.projectId));
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  let work!: Promise<void>;
  act(() => {
    work = hook.result.current.recover(take);
  });
  act(() => hook.result.current.cancel());
  vi.mocked(recordingApi.list).mockResolvedValue([take, recovered]);
  await act(async () => {
    finish(recovered);
    await work;
  });
  expect(hook.result.current.takes).toEqual([take, recovered]);
  expect(hook.result.current.notice).toContain('완료된 복구본');
  expect(hook.result.current.error).toBeNull();
  expect(take.state).toBe('RECOVERABLE_ERROR');
});
it('이전 프로젝트의 취소는 새 복구를 중단하지 않는다', async () => {
  const hook = renderHook(
    (projectId: string | undefined) => useRecordedTakes(projectId),
    { initialProps: take.projectId },
  );
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  const oldCancel = hook.result.current.cancel;
  hook.rerender(undefined);
  hook.rerender(take.projectId);
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  let finish!: (value: RecordedTake) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(recordingApi.recover).mockImplementation(
    (_projectId, _takeId, current) => {
      signal = current;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  let work!: Promise<void>;
  act(() => {
    work = hook.result.current.recover(take);
  });
  act(oldCancel);
  expect(signal?.aborted).toBe(false);
  await act(async () => {
    finish(
      recordingFixture({ id: crypto.randomUUID(), recoveredFrom: take.id }),
    );
    await work;
  });
  expect(hook.result.current.busy).toBe(false);
});
it('프로젝트를 바꿔도 이전 복구의 실제 종료 전에는 새 저장을 시작하지 않는다', async () => {
  const next = recordingFixture({
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
  });
  let finish!: (cause: DOMException) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(recordingApi.recover).mockImplementation(
    (_projectId, _takeId, current) => {
      signal = current;
      return new Promise((_resolve, reject) => {
        finish = reject;
      });
    },
  );
  const hook = renderHook(
    (projectId: string | undefined) => useRecordedTakes(projectId),
    { initialProps: take.projectId },
  );
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  let work!: Promise<void>;
  act(() => {
    work = hook.result.current.recover(take);
  });
  vi.mocked(recordingApi.list).mockResolvedValue([next]);
  hook.rerender(next.projectId);
  await waitFor(() => expect(hook.result.current.takes).toEqual([next]));
  expect(signal?.aborted).toBe(true);
  expect(hook.result.current.busy).toBe(true);
  await act(async () => {
    await hook.result.current.update(next, '새 프로젝트', '', 0);
  });
  expect(recordingApi.update).not.toHaveBeenCalled();
  await act(async () => {
    finish(new DOMException('취소', 'AbortError'));
    await work;
  });
  expect(hook.result.current.busy).toBe(false);
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.notice).toBeNull();
  await act(async () => {
    await hook.result.current.update(next, '새 프로젝트', '', 0);
  });
  expect(recordingApi.update).toHaveBeenCalledExactlyOnceWith(
    next,
    '새 프로젝트',
    '',
    0,
  );
});
