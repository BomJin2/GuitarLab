import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectFixture, projectFixtureId } from '../../test/projectFixture';
import { scoreHistoryApi } from './scoreHistory';
import { ScoreHistoryPanel } from './ScoreHistoryPanel';
import { scoreExportApi } from '../score/scoreExport';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import type { RevisionDocument } from './projects';
vi.mock('./scoreHistory', () => ({
  scoreHistoryApi: { list: vi.fn(), read: vi.fn() },
}));
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

async function readPreview(revision: RevisionDocument) {
  const entry = {
    revisionId: revision.revisionId,
    revision: revision.revision,
    createdAtMs: 1,
  };
  vi.mocked(scoreHistoryApi.list).mockResolvedValue({
    projectId: revision.projectId,
    headRevision: revision.revision,
    entries: [
      entry,
      {
        revisionId: '00000000-0000-4000-8000-000000000099',
        revision: revision.revision - 1,
        createdAtMs: 0,
      },
    ],
    nextBeforeRevision: null,
  });
  vi.mocked(scoreHistoryApi.read).mockResolvedValue(revision);
  const view = render(
    <ScoreHistoryPanel projectId={revision.projectId} disabled={false} />,
  );
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
  return view;
}

it('조회한 정규화 버전 전체만 출력하며 다른 버전 선택·중복·실패 후에도 조회와 원본을 보존한다', async () => {
  const available = vi
    .spyOn(scoreExportApi, 'available')
    .mockReturnValue(false);
  const revision = projectFixture().revision;
  if (!revision) throw new Error('자체 악보 누락');
  revision.revision = 3;
  revision.score = {
    ...scoreEditingFixture().document,
    renderSource: 'NORMALIZED',
  };
  const before = JSON.stringify(revision);
  let complete: (() => void) | undefined;
  const exportFile = vi.spyOn(scoreExportApi, 'export').mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        complete = () => resolve({ format: 'JSON', bytes: 100 });
      }),
  );
  const view = await readPreview(revision);
  expect(screen.getByText(/새 파일 저장은 Windows 앱/)).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: '조회 버전을 새 JSON으로 내보내기' })
      .hasAttribute('disabled'),
  ).toBe(true);
  available.mockReturnValue(true);
  view.rerender(
    <ScoreHistoryPanel projectId={revision.projectId} disabled={false} />,
  );
  expect(exportFile).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('저장 버전'), {
    target: { value: '00000000-0000-4000-8000-000000000099' },
  });
  expect(screen.getByText(/출력 대상: 조회한 버전 3/)).toBeTruthy();
  const json = screen.getByRole('button', {
    name: '조회 버전을 새 JSON으로 내보내기',
  });
  fireEvent.click(json);
  fireEvent.click(json);
  fireEvent.click(screen.getByRole('button', { name: '최신 버전 목록 읽기' }));
  expect(exportFile).toHaveBeenCalledTimes(1);
  expect(exportFile).toHaveBeenLastCalledWith(
    revision.score,
    'JSON',
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(scoreHistoryApi.list).toHaveBeenCalledTimes(1);
  expect(
    screen
      .getByRole('button', { name: '저장 내용 조회' })
      .hasAttribute('disabled'),
  ).toBe(true);
  await act(async () => complete?.());
  await screen.findByText(/새 JSON 파일로 저장했습니다/);
  const xml = screen.getByRole('button', {
    name: '조회 버전을 새 MusicXML로 내보내기',
  });
  exportFile.mockRejectedValueOnce(new Error('DISK_SPACE_LOW'));
  fireEvent.click(xml);
  await screen.findByRole('alert');
  expect(screen.getByText(/저장 공간이 부족/)).toBeTruthy();
  exportFile.mockResolvedValueOnce({ format: 'MUSICXML', bytes: 120 });
  fireEvent.click(xml);
  await screen.findByText(/새 MUSICXML 파일로 저장했습니다/);
  expect(exportFile).toHaveBeenLastCalledWith(
    revision.score,
    'MUSICXML',
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(scoreHistoryApi.read).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(revision)).toBe(before);
  view.rerender(
    <ScoreHistoryPanel projectId={revision.projectId} disabled={true} />,
  );
  fireEvent.click(json);
  expect(exportFile).toHaveBeenCalledTimes(3);
});

it('버전 출력 취소·문맥 이탈 후 늦은 성공을 적용하지 않고 기존 조회 내용을 유지한다', async () => {
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const revision = projectFixture().revision;
  if (!revision) throw new Error('자체 악보 누락');
  revision.revision = 3;
  revision.score = {
    ...scoreEditingFixture().document,
    renderSource: 'NORMALIZED',
  };
  let complete: (() => void) | undefined;
  const exportFile = vi.spyOn(scoreExportApi, 'export').mockImplementation(
    async () =>
      new Promise((resolve) => {
        complete = () => resolve({ format: 'JSON', bytes: 100 });
      }),
  );
  const view = await readPreview(revision);
  fireEvent.click(
    screen.getByRole('button', { name: '조회 버전을 새 JSON으로 내보내기' }),
  );
  const signal = exportFile.mock.calls[0]?.[2];
  fireEvent.click(screen.getByRole('button', { name: '버전 출력 취소' }));
  expect(signal?.aborted).toBe(true);
  await act(async () => complete?.());
  expect(screen.queryByText(/새 JSON 파일로 저장했습니다/)).toBeNull();
  expect(
    screen.getByRole('region', { name: '저장 악보 읽기 전용' }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: '조회 버전을 새 JSON으로 내보내기' }),
  );
  const second = exportFile.mock.calls[1]?.[2];
  view.rerender(
    <ScoreHistoryPanel
      projectId="00000000-0000-4000-8000-000000000098"
      disabled={false}
    />,
  );
  expect(second?.aborted).toBe(true);
  await act(async () => complete?.());
  expect(
    screen.queryByRole('region', { name: '조회 버전 내보내기' }),
  ).toBeNull();
  expect(screen.queryByText(/새 JSON 파일로 저장했습니다/)).toBeNull();
});
it('명시적으로 목록·내용만 읽고 저장된 트랙·100음 표를 표시한다', async () => {
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  const exportFile = vi.spyOn(scoreExportApi, 'export');
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
  const json = screen.getByRole('button', {
    name: '조회 버전을 새 JSON으로 내보내기',
  });
  expect(json.hasAttribute('disabled')).toBe(true);
  fireEvent.click(json);
  expect(exportFile).not.toHaveBeenCalled();
  rerender(<ScoreHistoryPanel projectId={projectFixtureId} disabled={true} />);
  expect(
    screen
      .getByRole('button', { name: '최신 버전 목록 읽기' })
      .hasAttribute('disabled'),
  ).toBe(true);
});
