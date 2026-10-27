import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectFixture } from '../../test/projectFixture';
import { recordingFixture } from '../../test/recordingFixture';
import { recordingApi, type RecordedTake } from './recordings';
import { RecordingsPage } from './RecordingsPage';

vi.mock('./recordings', async (original) => ({
  ...(await original<typeof import('./recordings')>()),
  recordingApi: { list: vi.fn(), update: vi.fn(), recover: vi.fn() },
}));
vi.mock('./TakeReplay', () => ({
  TakeReplay: ({ take }: { take: RecordedTake }) => (
    <p>DEMO 청취: {take.name}</p>
  ),
}));
vi.mock('./TakeExportPanel', () => ({ TakeExportPanel: () => null }));
vi.mock('./RecordedPitchesPanel', () => ({ RecordedPitchesPanel: () => null }));
const take = recordingFixture();
function project(id = take.projectId) {
  const details = projectFixture();
  return {
    details: { ...details, project: { ...details.project, id } },
    busy: false,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(recordingApi.list).mockResolvedValue([take]);
});
afterEach(cleanup);

it('프로젝트 변경은 이전 A/B 선택과 재생 패널을 해제한다', async () => {
  const view = render(<RecordingsPage project={project()} />);
  await within(screen.getByLabelText('A 테이크')).findByRole('option', {
    name: new RegExp(take.name),
  });
  fireEvent.change(screen.getByLabelText('A 테이크'), {
    target: { value: take.id },
  });
  expect(screen.getByText(`DEMO 청취: ${take.name}`)).toBeTruthy();
  vi.mocked(recordingApi.list).mockImplementation(
    () => new Promise(() => undefined),
  );
  view.rerender(<RecordingsPage project={project(crypto.randomUUID())} />);
  expect(screen.queryByText(`DEMO 청취: ${take.name}`)).toBeNull();
  expect(screen.getByLabelText('A 테이크')).toHaveProperty('value', '');
  expect(screen.queryByText(/저장된 테이크가 없습니다/)).toBeNull();
});
it('미완료·취소 조회를 빈 목록으로 표시하지 않고 성공한 빈 조회만 안내한다', async () => {
  let finish!: (value: RecordedTake[]) => void;
  vi.mocked(recordingApi.list).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<RecordingsPage project={project()} />);
  expect(screen.queryByText(/저장된 테이크가 없습니다/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '목록 조회 취소' }));
  expect(screen.getByText(/목록 조회를 취소/)).toBeTruthy();
  expect(screen.queryByText(/저장된 테이크가 없습니다/)).toBeNull();
  vi.mocked(recordingApi.list).mockResolvedValue([]);
  fireEvent.click(screen.getByRole('button', { name: '테이크 새로고침' }));
  await screen.findByText(/저장된 테이크가 없습니다/);
  await act(async () => {
    finish([take]);
  });
  expect(
    screen.queryByRole('option', { name: new RegExp(take.name) }),
  ).toBeNull();
});
