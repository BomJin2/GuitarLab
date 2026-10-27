import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ResultsPage } from './ResultsPage';
import { recordApi } from './records';
import type { ProjectController } from '../library/useProjects';
import { projectFixture, recordFixture } from '../../test/projectFixture';
vi.mock('./records', async (original) => ({
  ...(await original<typeof import('./records')>()),
  recordApi: { list: vi.fn(), events: vi.fn() },
}));
beforeEach(() => vi.resetAllMocks());
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
  expect(screen.queryByText('아직 저장된 연습 기록이 없습니다')).toBeNull();
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

it('시도를 바꾼 첫 화면부터 이전 마디 결과를 표시하지 않는다', async () => {
  const first = recordFixture();
  const second = {
    ...recordFixture(),
    attemptId: '00000000-0000-4000-8000-000000000099',
    state: 'STOPPED' as const,
  };
  vi.mocked(recordApi.list).mockResolvedValue([first, second]);
  vi.mocked(recordApi.events)
    .mockResolvedValueOnce(
      first.snapshot.events.map((event) => ({
        sequence: event.sequence,
        measureIndex: 0,
        event,
      })),
    )
    .mockImplementationOnce(() => new Promise(() => undefined));
  const commits: string[] = [];
  render(
    <Profiler
      id="results"
      onRender={() => commits.push(document.body.textContent ?? '')}
    >
      <ResultsPage project={controller()} />
    </Profiler>,
  );
  await screen.findByText('1마디 · 100.0%');
  commits.length = 0;
  fireEvent.change(screen.getByRole('combobox', { name: '저장된 연습 시도' }), {
    target: { value: second.attemptId },
  });
  expect(commits.some((text) => text.includes('사용자 중단 · 1,000점'))).toBe(
    true,
  );
  expect(
    commits.some(
      (text) =>
        text.includes('사용자 중단 · 1,000점') &&
        text.includes('1마디 · 100.0%'),
    ),
  ).toBe(false);
});

it('판정 조회를 취소한 뒤 같은 시도만 다시 읽을 수 있다', async () => {
  const record = recordFixture();
  vi.mocked(recordApi.list).mockResolvedValue([record]);
  let signal: AbortSignal | undefined;
  let finish: (() => void) | undefined;
  vi.mocked(recordApi.events)
    .mockImplementationOnce((_record, currentSignal) => {
      signal = currentSignal;
      return new Promise((resolve) => {
        finish = () => resolve([]);
      });
    })
    .mockResolvedValueOnce(
      record.snapshot.events.map((event) => ({
        sequence: event.sequence,
        measureIndex: 0,
        event,
      })),
    );
  render(<ResultsPage project={controller()} />);
  fireEvent.click(
    await screen.findByRole('button', { name: '기록 조회 취소' }),
  );
  expect(signal?.aborted).toBe(true);
  expect(screen.getByText('판정 조회를 취소했습니다.')).toBeTruthy();
  await act(async () => finish?.());
  expect(screen.queryByRole('heading', { name: '마디별 정확도' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '판정 다시 읽기' }));
  await screen.findByText('1마디 · 100.0%');
  expect(recordApi.list).toHaveBeenCalledTimes(1);
  expect(recordApi.events).toHaveBeenCalledTimes(2);
});

it('판정 조회 실패 후 목록을 새로 읽지 않고 재시도한다', async () => {
  const record = recordFixture();
  vi.mocked(recordApi.list).mockResolvedValue([record]);
  vi.mocked(recordApi.events)
    .mockRejectedValueOnce({ code: 'STORAGE_ERROR' })
    .mockResolvedValueOnce([]);
  render(<ResultsPage project={controller()} />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '판정 다시 읽기' }));
  await screen.findByText('확정된 음표 기록이 없습니다.');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(recordApi.list).toHaveBeenCalledTimes(1);
  expect(recordApi.events).toHaveBeenCalledTimes(2);
});

it('프로젝트 변경의 첫 화면부터 이전 시도 요약과 차트를 숨긴다', async () => {
  const project = controller();
  const secondId = '00000000-0000-4000-8000-000000000099';
  const firstProject = project.projects[0];
  if (!firstProject) throw new Error('테스트 프로젝트가 없습니다.');
  project.projects.push({
    ...firstProject,
    id: secondId,
    title: '다른 프로젝트',
  });
  const record = recordFixture();
  vi.mocked(recordApi.list)
    .mockResolvedValueOnce([record])
    .mockImplementationOnce(() => new Promise(() => undefined));
  vi.mocked(recordApi.events).mockResolvedValue(
    record.snapshot.events.map((event) => ({
      sequence: event.sequence,
      measureIndex: 0,
      event,
    })),
  );
  const commits: string[] = [];
  render(
    <Profiler
      id="project-results"
      onRender={() => commits.push(document.body.textContent ?? '')}
    >
      <ResultsPage project={project} />
    </Profiler>,
  );
  await screen.findByText('1마디 · 100.0%');
  commits.length = 0;
  fireEvent.change(screen.getByRole('combobox', { name: '결과 프로젝트' }), {
    target: { value: secondId },
  });
  expect(commits.length).toBeGreaterThan(0);
  expect(commits.some((text) => text.includes('완료 · 1,000점'))).toBe(false);
  expect(commits.some((text) => text.includes('1마디 · 100.0%'))).toBe(false);
  expect(screen.getByText('저장 기록을 읽는 중입니다.')).toBeTruthy();
  expect(recordApi.events).toHaveBeenCalledTimes(1);
});
