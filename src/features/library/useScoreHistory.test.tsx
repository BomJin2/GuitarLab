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
