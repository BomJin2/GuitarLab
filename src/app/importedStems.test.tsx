import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectDetails } from '../features/library/projects';
import { importedStemsApi } from '../features/performance/importedStems';
import { PlayerProvider } from '../features/player/PlayerContext';
import { App } from './App';

const details: ProjectDetails = {
  schemaVersion: 1,
  project: {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'DEMO 패널 회귀 프로젝트',
    artist: null,
    mode: 'performance',
    revision: 0,
    revisionId: null,
    updatedAtMs: 1,
  },
  revision: null,
  assets: [],
};
vi.mock('../features/library/useProjects', async (original) => {
  const actual =
    await original<typeof import('../features/library/useProjects')>();
  return {
    ...actual,
    useProjects: (...args: Parameters<typeof actual.useProjects>) => ({
      ...actual.useProjects(...args),
      native: true,
      details,
      busy: false,
    }),
  };
});
vi.mock('../features/performance/useProjectMix', async (original) => {
  const actual =
    await original<typeof import('../features/performance/useProjectMix')>();
  return {
    ...actual,
    useProjectMix: (...args: Parameters<typeof actual.useProjectMix>) =>
      actual.useProjectMix(undefined, args[1], args[2], args[3]),
  };
});
beforeEach(() => {
  window.location.hash = '#/performance';
  vi.spyOn(importedStemsApi, 'available').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('저장 프로젝트의 부모 갱신이 반복돼도 기타 파일 패널은 하나이며 선택 역할을 유지한다', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  expect(
    screen.getAllByRole('heading', { name: '별도 기타 파일 불러오기' }),
  ).toHaveLength(1);
  const role = screen.getByRole('combobox', { name: '파일의 기타 역할' });
  expect(role).toHaveProperty('disabled', false);
  fireEvent.change(role, { target: { value: 'LEAD' } });
  for (let index = 0; index < 12; index++) {
    fireEvent.click(screen.getByRole('button', { name: '단축키 안내' }));
    expect(
      screen.getAllByRole('heading', { name: '별도 기타 파일 불러오기' }),
    ).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: '파일의 기타 역할' })).toBe(
      role,
    );
    expect(role).toHaveProperty('value', 'LEAD');
  }
  fireEvent.change(role, { target: { value: 'RHYTHM' } });
  fireEvent.click(screen.getByRole('button', { name: '단축키 안내' }));
  expect(role).toHaveProperty('value', 'RHYTHM');
  expect(
    errors.mock.calls
      .flat()
      .some((value) => typeof value === 'string' && value.includes('same key')),
  ).toBe(false);
});
