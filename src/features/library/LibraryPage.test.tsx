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
import { projectMetadataApi } from './projectMetadata';
vi.mock('./projectMetadata', async (original) => ({
  ...(await original<typeof import('./projectMetadata')>()),
  projectMetadataApi: { update: vi.fn() },
}));

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
  projectTrashApi: {
    list: vi.fn(),
    trash: vi.fn(),
    restore: vi.fn(),
    usage: vi.fn(),
  },
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
it('로컬 검색과 지우기는 제목/아티스트를 거르고 프로젝트를 열거나 다시 읽지 않는다', async () => {
  const first = {
    ...projectFixture().project,
    title: 'Ｇｕｉｔａｒ 연습',
    artist: '연주자',
  };
  const second = {
    ...first,
    id: '00000000-0000-4000-8000-000000000099',
    title: '두 번째 곡',
    artist: null,
  };
  const projects = [first, second];
  const before = JSON.stringify(projects);
  vi.mocked(projectApi.list).mockResolvedValue(projects);
  render(
    <Context.Provider value={engine}>
      <Workspace />
    </Context.Provider>,
  );
  await screen.findByRole('heading', { name: first.title });
  fireEvent.change(screen.getByLabelText('프로젝트 검색'), {
    target: { value: 'guitar 연주자' },
  });
  expect(screen.getByRole('heading', { name: first.title })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: second.title })).toBeNull();
  expect(screen.getByText('검색 결과 1/2개')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('프로젝트 검색'), {
    target: { value: '없는 프로젝트' },
  });
  expect(
    screen.getByRole('heading', { name: '검색 결과가 없습니다' }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('heading', { name: '첫 프로젝트를 기다리고 있어요' }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText('프로젝트 검색'), {
    target: { value: '가'.repeat(201) },
  });
  expect(screen.getByText('검색어는 200자 이하로 입력하세요.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '검색 지우기' }));
  expect(screen.getByRole('heading', { name: first.title })).toBeTruthy();
  expect(screen.getByRole('heading', { name: second.title })).toBeTruthy();
  expect(projectApi.list).toHaveBeenCalledOnce();
  expect(projectApi.open).not.toHaveBeenCalled();
  expect(JSON.stringify(projects)).toBe(before);
});
it('열린 프로젝트의 정보만 명시적으로 수정하며 실패 뒤 폼과 기존 제목을 유지한다', async () => {
  const details = projectFixture();
  vi.mocked(projectApi.list).mockResolvedValue([details.project]);
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  vi.mocked(projectMetadataApi.update).mockRejectedValue(
    new Error('PROJECT_METADATA_CONFLICT'),
  );
  render(
    <Context.Provider value={engine}>
      <Workspace />
    </Context.Provider>,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: `프로젝트 열기 · ${details.project.title}`,
    }),
  );
  const title = await screen.findByLabelText('수정할 프로젝트 제목');
  fireEvent.change(title, { target: { value: '연습곡' } });
  fireEvent.change(screen.getByLabelText('수정할 프로젝트 아티스트'), {
    target: { value: '기타 연주자' },
  });
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 정보 저장' }));
  await screen.findByText(/프로젝트 정보가 바뀌었습니다/);
  expect(title).toHaveProperty('value', '연습곡');
  expect(
    screen.getByRole('heading', { name: details.project.title }),
  ).toBeTruthy();
  const updated = {
    ...details.project,
    title: '연습곡',
    artist: '기타 연주자',
    updatedAtMs: details.project.updatedAtMs + 1,
  };
  vi.mocked(projectMetadataApi.update).mockResolvedValue(updated);
  vi.mocked(projectApi.list).mockResolvedValue([updated]);
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 정보 저장' }));
  await screen.findByText(/프로젝트 정보를 저장했습니다/);
  expect(screen.getByRole('heading', { name: '연습곡' })).toBeTruthy();
  expect(screen.getByLabelText('수정할 프로젝트 아티스트')).toHaveProperty(
    'value',
    '기타 연주자',
  );
});
it('보관 용량은 명시적 요청 후 표시하고 확인 중 복원을 막으며 원본을 열지 않는다', async () => {
  const entry = {
    project: projectFixture().project,
    trashId: '00000000-0000-4000-8000-0000000000f2',
    trashedAtMs: 42,
  };
  vi.mocked(projectApi.list).mockResolvedValue([]);
  vi.mocked(projectTrashApi.list).mockResolvedValue([entry]);
  let finish: (() => void) | undefined;
  vi.mocked(projectTrashApi.usage).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            projectId: entry.project.id,
            trashId: entry.trashId,
            files: 2,
            logicalBytes: 1024,
            externalReferences: 1,
          });
      }),
  );
  render(
    <Context.Provider value={engine}>
      <Workspace />
    </Context.Provider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: '휴지통 목록 다시 읽기' }),
  );
  const inspect = await screen.findByRole('button', {
    name: `용량 확인 · ${entry.project.title}`,
  });
  expect(projectTrashApi.usage).not.toHaveBeenCalled();
  fireEvent.click(inspect);
  expect(
    screen
      .getByRole('button', { name: `복원 · ${entry.project.title}` })
      .hasAttribute('disabled'),
  ).toBe(true);
  await act(async () => finish?.());
  expect(await screen.findByText(/논리 크기 1,024바이트/)).toBeTruthy();
  expect(screen.getByText(/실제 회수 가능 공간이 아닙니다/)).toBeTruthy();
  expect(projectApi.open).not.toHaveBeenCalled();
  expect(projectTrashApi.restore).not.toHaveBeenCalled();
});
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
