import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ResultsPage } from './ResultsPage';
import { recordApi } from './records';
import type { ProjectController } from '../library/useProjects';
import { projectFixture, recordFixture } from '../../test/projectFixture';
vi.mock('./records', async (original) => ({
  ...(await original<typeof import('./records')>()),
  recordApi: { list: vi.fn(), events: vi.fn() },
}));
beforeEach(() => vi.clearAllMocks());
function controller(): ProjectController {
  const details = projectFixture();
  return {
    native: true,
    projects: [details.project],
    details,
    busy: false,
    listBusy: false,
    trashedProjects: [],
    trashLoaded: false,
    trashListBusy: false,
    trashUsage: null,
    inspectTrashUsage: vi.fn(),
    refreshTrash: vi.fn(async () => undefined),
    trashProject: vi.fn(async () => undefined),
    restoreProject: vi.fn(async () => undefined),
    job: null,
    error: null,
    notice: null,
    audioAssetId: null,
    scoreSaved: true,
    refresh: vi.fn(),
    open: vi.fn(),
    create: vi.fn(),
    updateMetadata: vi.fn(),
    importAsset: vi.fn(),
    createBlankScore: vi.fn(),
    relink: vi.fn(),
    save: vi.fn(),
    cancel: vi.fn(),
  };
}
it('데이터 없음과 저장 실패를 실제 빈 상태·오류로 표시한다', async () => {
  vi.mocked(recordApi.list).mockResolvedValue([]);
  const { unmount } = render(<ResultsPage project={controller()} />);
  await waitFor(() =>
    expect(screen.getByText('아직 저장된 연습 기록이 없습니다')).toBeTruthy(),
  );
  unmount();
  vi.mocked(recordApi.list).mockRejectedValue({ code: 'STORAGE_ERROR' });
  render(<ResultsPage project={controller()} />);
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('기존 데이터'),
  );
});
it('native 저장된 판정·마디와 비교 가능한 최고점을 표시한다', async () => {
  const record = recordFixture();
  vi.mocked(recordApi.list).mockResolvedValue([record]);
  vi.mocked(recordApi.events).mockResolvedValue(
    record.snapshot.events.map((event) => ({
      sequence: event.sequence,
      measureIndex: 0,
      event,
    })),
  );
  render(<ResultsPage project={controller()} />);
  await waitFor(() => expect(screen.getByText('1마디 · 100.0%')).toBeTruthy());
  expect(screen.getByRole('heading', { name: '완료 · 1,000점' })).toBeTruthy();
  expect(screen.getByText(/동일 조건 최고 기록: 1,000점/)).toBeTruthy();
  expect(screen.getByText('−50 ~ 0 ms · 1회')).toBeTruthy();
});
it('비정상 종료 기록은 확정 구간만 표시하고 완료 점수로 오인하지 않는다', async () => {
  const record = recordFixture();
  record.state = 'INTERRUPTED';
  record.completedOrder = null;
  record.snapshot = { ...record.snapshot, state: 'RUNNING' };
  vi.mocked(recordApi.list).mockResolvedValue([record]);
  vi.mocked(recordApi.events).mockResolvedValue(
    record.snapshot.events.map((event) => ({
      sequence: event.sequence,
      measureIndex: 0,
      event,
    })),
  );
  render(<ResultsPage project={controller()} />);
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: '앱 종료로 중단 · 1,000점' }),
    ).toBeTruthy(),
  );
  expect(screen.getByText(/최고 기록 비교에서 제외/)).toBeTruthy();
  expect(screen.queryByText(/동일 조건 최고 기록:/)).toBeNull();
});
