import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { projectFixture, projectFixtureId } from '../../test/projectFixture';
import { scoreHistoryApi } from './scoreHistory';
import { ScoreHistoryPanel } from './ScoreHistoryPanel';
vi.mock('./scoreHistory', () => ({
  scoreHistoryApi: { list: vi.fn(), read: vi.fn() },
}));
beforeEach(() => vi.resetAllMocks());
it('명시적으로 목록·내용만 읽고 저장된 트랙·100음 표를 표시한다', async () => {
  const revision = projectFixture().revision;
  if (!revision) throw new Error('자체 악보 누락');
  const track = revision.score.tracks[0];
  const note = track?.notes[0];
  if (!track || !note) throw new Error('자체 트랙 누락');
  revision.score.tracks.push({
    ...track,
    id: 'second',
    name: '이전 리듬',
    notes: Array.from({ length: 101 }, (_, index) => ({
      ...note,
      id: `note-${index}`,
      trackId: 'second',
    })),
  });
  const before = JSON.stringify(revision);
  const entry = { revisionId: projectFixtureId, revision: 1, createdAtMs: 1 };
  vi.mocked(scoreHistoryApi.list).mockResolvedValue({
    projectId: projectFixtureId,
    headRevision: 1,
    entries: [entry],
    nextBeforeRevision: null,
  });
  vi.mocked(scoreHistoryApi.read).mockResolvedValue(revision);
  const { rerender } = render(
    <ScoreHistoryPanel projectId={projectFixtureId} disabled={false} />,
  );
  expect(scoreHistoryApi.list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '최신 버전 목록 읽기' }));
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: '저장 내용 조회' })
        .hasAttribute('disabled'),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: '저장 내용 조회' }));
  await screen.findByRole('region', { name: '저장 악보 읽기 전용' });
  fireEvent.change(screen.getByLabelText('저장된 트랙'), {
    target: { value: '1' },
  });
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
    101,
  );
  expect(
    screen.queryByRole('button', { name: /적용|프로젝트 저장|삭제|재생/ }),
  ).toBeNull();
  expect(JSON.stringify(revision)).toBe(before);
  rerender(<ScoreHistoryPanel projectId={projectFixtureId} disabled={true} />);
  expect(
    screen
      .getByRole('button', { name: '최신 버전 목록 읽기' })
      .hasAttribute('disabled'),
  ).toBe(true);
});
