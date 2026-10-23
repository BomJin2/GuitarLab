import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { projectFixture } from '../../test/projectFixture';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import type { ScoreSession } from '../score/scoreSession';
import { LibraryPage } from './LibraryPage';
import { useProjects } from './useProjects';
import { projectApi } from './projects';
import { projectTrashApi } from './projectTrash';

vi.mock('./projects', async (original) => ({
  ...(await original<typeof import('./projects')>()),
  projectApi: {
    available: () => true,
    list: vi.fn(),
    open: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('./projectTrash', async (original) => ({
  ...(await original<typeof import('./projectTrash')>()),
  projectTrashApi: { list: vi.fn(), trash: vi.fn(), restore: vi.fn() },
}));
let engine: PlayerEngine;
beforeEach(() => {
  vi.clearAllMocks();
  engine = new PlayerEngine();
});
afterEach(() => engine.dispose());
function Workspace() {
  const [session, setSession] = useState<ScoreSession | null>(null);
  const project = useProjects(session, setSession, () => true);
  return <LibraryPage project={project} />;
}
it('다른 항목을 보관·복원해도 현재 프로젝트는 자동 교체하지 않는다', async () => {
  const details = projectFixture();
  const current = { ...details.project, title: '현재 연습' };
  const other = {
    ...current,
    id: '00000000-0000-4000-8000-0000000000f1',
    title: '보관할 연습',
  };
  const entry = {
    project: other,
    trashId: '00000000-0000-4000-8000-0000000000f2',
    trashedAtMs: 42,
  };
  vi.mocked(projectApi.list).mockResolvedValue([current, other]);
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    project: current,
    revision: null,
    assets: [],
  });
  vi.mocked(projectTrashApi.list).mockResolvedValue([entry]);
  vi.mocked(projectTrashApi.trash).mockResolvedValue(entry);
  vi.mocked(projectTrashApi.restore).mockResolvedValue(other);
  render(
    <Context.Provider value={engine}>
      <Workspace />
    </Context.Provider>,
  );
  expect(screen.queryByText('보관된 프로젝트가 없습니다.')).toBeNull();
  fireEvent.click(
    await screen.findByRole('button', { name: '프로젝트 열기 · 현재 연습' }),
  );
  await screen.findByText(
    '현재 열린 프로젝트 · 보관 완료 후 작업 화면을 닫습니다.',
  );
  vi.mocked(projectApi.list).mockResolvedValue([current]);
  fireEvent.click(
    screen.getByRole('button', { name: '휴지통에 보관 · 보관할 연습' }),
  );
  await screen.findByRole('button', { name: '복원 · 보관할 연습' });
  expect(screen.getByText(/원본·녹음 파일은 유지/)).toBeTruthy();
  vi.mocked(projectApi.list).mockResolvedValue([current, other]);
  vi.mocked(projectTrashApi.list).mockResolvedValue([]);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: '복원 · 보관할 연습' })),
  );
  await screen.findByText('보관된 프로젝트가 없습니다.');
  expect(projectApi.open).toHaveBeenCalledTimes(1);
  expect(
    screen
      .getByRole('button', { name: '휴지통에 보관 · 현재 연습' })
      .hasAttribute('disabled'),
  ).toBe(false);
});
it('새로 만든 유일한 프로젝트도 바로 보관하고 복원할 수 있다', async () => {
  const created = {
    ...projectFixture().project,
    title: '보관 테스트',
    revision: 0,
    revisionId: null,
  };
  const entry = {
    project: created,
    trashId: '00000000-0000-4000-8000-0000000000f2',
    trashedAtMs: 42,
  };
  vi.mocked(projectApi.list).mockResolvedValue([]);
  vi.mocked(projectApi.create).mockResolvedValue(created);
  vi.mocked(projectTrashApi.trash).mockResolvedValue(entry);
  vi.mocked(projectTrashApi.list).mockResolvedValue([entry]);
  vi.mocked(projectTrashApi.restore).mockResolvedValue(created);
  render(
    <Context.Provider value={engine}>
      <Workspace />
    </Context.Provider>,
  );
  fireEvent.change(screen.getByLabelText('프로젝트 제목'), {
    target: { value: '보관 테스트' },
  });
  fireEvent.click(screen.getByRole('button', { name: '새 프로젝트 만들기' }));
  const archive = await screen.findByRole('button', {
    name: '휴지통에 보관 · 보관 테스트',
  });
  await waitFor(() => expect(archive.hasAttribute('disabled')).toBe(false));
  fireEvent.click(archive);
  await screen.findByRole('button', { name: '복원 · 보관 테스트' });
  await screen.findByText(/프로젝트를 만들거나 열면/);
  expect(projectTrashApi.trash).toHaveBeenCalledWith(
    created,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  vi.mocked(projectApi.list).mockResolvedValue([created]);
  vi.mocked(projectTrashApi.list).mockResolvedValue([]);
  fireEvent.click(screen.getByRole('button', { name: '복원 · 보관 테스트' }));
  await screen.findByRole('button', { name: '프로젝트 열기 · 보관 테스트' });
  expect(projectApi.open).not.toHaveBeenCalled();
});
