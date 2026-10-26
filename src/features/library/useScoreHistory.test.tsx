import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { projectFixture, projectFixtureId } from '../../test/projectFixture';
import type { RevisionDocument } from './projects';
import { scoreHistoryApi } from './scoreHistory';
import { useScoreHistory } from './useScoreHistory';
vi.mock('./scoreHistory', () => ({
  scoreHistoryApi: { list: vi.fn(), read: vi.fn() },
}));
const entry = { revisionId: projectFixtureId, revision: 1, createdAtMs: 1 };
const page = {
  projectId: projectFixtureId,
  headRevision: 1,
  entries: [entry],
  nextBeforeRevision: null,
};
beforeEach(() => vi.resetAllMocks());
it('새 프로젝트에 반환하는 첫 상태부터 이전 목록과 악보를 노출하지 않는다', async () => {
  const revision = projectFixture().revision;
  if (!revision) throw new Error('자체 악보 누락');
  vi.mocked(scoreHistoryApi.list).mockResolvedValue(page);
  vi.mocked(scoreHistoryApi.read).mockResolvedValue(revision);
  const observations: {
    id: string;
    page: string | null;
    preview: string | null;
  }[] = [];
  const hook = renderHook(
    ({ id }) => {
      const history = useScoreHistory(id);
      observations.push({
        id,
        page: history.page?.projectId ?? null,
        preview: history.preview?.projectId ?? null,
      });
      return history;
    },
    { initialProps: { id: projectFixtureId } },
  );
  await act(() => hook.result.current.load());
  await act(() => hook.result.current.read(entry));
  const nextId = '00000000-0000-4000-8000-000000000099';
  hook.rerender({ id: nextId });
  expect(
    observations
      .filter((item) => item.id === nextId)
      .every((item) => item.page === null && item.preview === null),
  ).toBe(true);
});
it('이전 프로젝트의 조회 함수를 나중에 호출해도 파일 작업을 시작하지 않는다', async () => {
  const revision = projectFixture().revision;
  if (!revision) throw new Error('자체 악보 누락');
  vi.mocked(scoreHistoryApi.list).mockResolvedValue(page);
  vi.mocked(scoreHistoryApi.read).mockResolvedValue(revision);
  const hook = renderHook(({ id }) => useScoreHistory(id), {
    initialProps: { id: projectFixtureId },
  });
  const previous = hook.result.current;
  hook.rerender({ id: '00000000-0000-4000-8000-000000000099' });
  await act(() => previous.load());
  await act(() => previous.read(entry));
  expect(scoreHistoryApi.list).not.toHaveBeenCalled();
  expect(scoreHistoryApi.read).not.toHaveBeenCalled();
});
it('이전 취소 함수는 새 프로젝트 조회를 취소하지 않고 현재 취소만 적용한다', async () => {
  let finish: ((value: typeof page) => void) | undefined;
  vi.mocked(scoreHistoryApi.list).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const nextId = '00000000-0000-4000-8000-000000000099';
  const hook = renderHook(({ id }) => useScoreHistory(id), {
    initialProps: { id: projectFixtureId },
  });
  const previousCancel = hook.result.current.cancel;
  hook.rerender({ id: nextId });
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.load();
  });
  const signal = vi.mocked(scoreHistoryApi.list).mock.calls[0]?.[2];
  try {
    act(previousCancel);
    expect(signal?.aborted).toBe(false);
    act(hook.result.current.cancel);
    expect(signal?.aborted).toBe(true);
  } finally {
    await act(async () => {
      finish?.({ ...page, projectId: nextId });
      await pending;
    });
  }
  expect(hook.result.current.page).toBeNull();
  hook.rerender({ id: projectFixtureId });
  act(() => {
    pending = hook.result.current.load();
  });
  const reopenedSignal = vi.mocked(scoreHistoryApi.list).mock.calls[1]?.[2];
  try {
    act(previousCancel);
    expect(reopenedSignal?.aborted).toBe(false);
    act(hook.result.current.cancel);
    expect(reopenedSignal?.aborted).toBe(true);
  } finally {
    await act(async () => {
      finish?.(page);
      await pending;
    });
  }
});
it('화면을 떠난 뒤 보관한 조회 함수는 새 파일 작업을 만들지 않는다', async () => {
  const revision = projectFixture().revision;
  if (!revision) throw new Error('자체 악보 누락');
  vi.mocked(scoreHistoryApi.list).mockResolvedValue(page);
  vi.mocked(scoreHistoryApi.read).mockResolvedValue(revision);
  const hook = renderHook(() => useScoreHistory(projectFixtureId));
  const previous = hook.result.current;
  hook.unmount();
  await act(() => previous.load());
  await act(() => previous.read(entry));
  expect(scoreHistoryApi.list).not.toHaveBeenCalled();
  expect(scoreHistoryApi.read).not.toHaveBeenCalled();
});
it('조회 실패·취소는 이전 목록과 미리보기를 보존하고 작업 종료 전 중복 조회를 막는다', async () => {
  vi.mocked(scoreHistoryApi.list).mockResolvedValue(page);
  const revision = projectFixture().revision;
  if (!revision) throw new Error('자체 악보 누락');
  vi.mocked(scoreHistoryApi.read).mockResolvedValue(revision);
  const { result } = renderHook(() => useScoreHistory(projectFixtureId));
  expect(scoreHistoryApi.list).not.toHaveBeenCalled();
  await act(() => result.current.load());
  await act(() => result.current.read(entry));
  vi.mocked(scoreHistoryApi.list).mockRejectedValue(new Error('STORAGE_ERROR'));
  await act(() => result.current.load());
  expect(result.current.page).toEqual(page);
  expect(result.current.preview).toEqual(revision);
  expect(result.current.error).toBeTruthy();
  let finish: (value: RevisionDocument) => void = () => {
    throw new Error('대기 작업 없음');
  };
  vi.mocked(scoreHistoryApi.read).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending: Promise<void>;
  act(() => {
    pending = result.current.read(entry);
  });
  act(() => result.current.cancel());
  expect(result.current.busy).toBe(true);
  expect(result.current.canceling).toBe(true);
  const calls = vi.mocked(scoreHistoryApi.list).mock.calls.length;
  await act(() => result.current.load());
  expect(scoreHistoryApi.list).toHaveBeenCalledTimes(calls);
  await act(async () => {
    finish({ ...revision, score: { ...revision.score, title: '늦은 응답' } });
    await pending;
  });
  expect(result.current.preview).toEqual(revision);
  expect(result.current.notice).toContain('취소');
  expect(result.current.busy).toBe(false);
});
it('프로젝트 전환/언마운트는 이전 조회를 취소하고 늦은 응답을 표시하지 않는다', async () => {
  let finish: (value: typeof page) => void = () => {
    throw new Error('대기 작업 없음');
  };
  vi.mocked(scoreHistoryApi.list).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender, unmount } = renderHook(
    ({ id }) => useScoreHistory(id),
    { initialProps: { id: projectFixtureId } },
  );
  let pending: Promise<void>;
  act(() => {
    pending = result.current.load();
  });
  const signal = vi.mocked(scoreHistoryApi.list).mock.calls[0]?.[2];
  rerender({ id: '00000000-0000-4000-8000-000000000099' });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish(page);
    await pending;
  });
  expect(result.current.page).toBeNull();
  await waitFor(() => expect(result.current.busy).toBe(false));
  act(() => {
    void result.current.load();
  });
  const nextSignal = vi.mocked(scoreHistoryApi.list).mock.calls[1]?.[2];
  unmount();
  expect(nextSignal?.aborted).toBe(true);
  finish(page);
});
