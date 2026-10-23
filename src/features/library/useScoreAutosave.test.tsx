import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { projectFixture } from '../../test/projectFixture';
import { editNote } from '../score/scoreEditing';
import { useScoreAutosave } from './useScoreAutosave';
import { writeScoreAutosavePreference } from './scoreAutosavePreference';

beforeEach(() => localStorage.removeItem('guitarlab.score-autosave.v1'));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.removeItem('guitarlab.score-autosave.v1');
});
it('컨트롤러를 다시 만들면 같은 프로젝트의 켜기·끄기를 복원한다', () => {
  const first = harness();
  act(() => first.result.current.setEnabled(true));
  first.unmount();
  first.engine.dispose();
  const second = harness();
  expect(second.result.current.enabled).toBe(true);
  act(() => second.result.current.setEnabled(false));
  second.unmount();
  second.engine.dispose();
  const third = harness();
  expect(third.result.current.enabled).toBe(false);
  third.engine.dispose();
});
it('손상된 설정은 기본 꺼짐으로 안내하고 저장 실패 때 현재 선택만 적용한다', () => {
  localStorage.setItem('guitarlab.score-autosave.v1', '{');
  const h = harness();
  expect(h.result.current.enabled).toBe(false);
  expect(h.result.current.preferenceError).toContain('읽지 못해');
  act(() => h.result.current.setEnabled(true));
  expect(h.result.current.enabled).toBe(true);
  expect(h.result.current.preferenceError).toContain('이번 실행에만');
  expect(localStorage.getItem('guitarlab.score-autosave.v1')).toBe('{');
  h.engine.dispose();
});
it('복원된 다른 프로젝트 선택은 이전 저장 예외를 물려받지 않고 녹음 잠금을 지킨다', async () => {
  const firstId = projectFixture().project.id;
  const secondId = '00000000-0000-4000-8000-000000000088';
  writeScoreAutosavePreference(firstId, true);
  writeScoreAutosavePreference(secondId, true);
  const h = harness();
  h.save.mockRejectedValueOnce(new Error('이전 프로젝트 저장 실패'));
  await act(async () => vi.advanceTimersByTime(30000));
  expect(h.result.current.notice).toContain('자동 저장하지 못했습니다');
  const revision = h.props.project.details.revision;
  const saved = h.props.session.savedRevision;
  if (!revision || !saved) throw new Error('저장 문맥 필요');
  const next = {
    ...h.props,
    project: {
      ...h.props.project,
      details: {
        ...h.props.project.details,
        project: { ...h.props.project.details.project, id: secondId },
        revision: { ...revision, projectId: secondId },
        assets: h.props.project.details.assets.map((a) => ({
          ...a,
          projectId: secondId,
        })),
      },
    },
    session: {
      ...h.props.session,
      savedRevision: { ...saved, projectId: secondId },
    },
    locked: true,
  };
  h.rerender(next);
  expect(h.result.current.enabled).toBe(true);
  await act(async () => vi.advanceTimersByTime(60000));
  expect(h.save).toHaveBeenCalledTimes(1);
  h.rerender({ ...next, locked: false });
  await act(async () => vi.advanceTimersByTime(30000));
  expect(h.save).toHaveBeenCalledTimes(2);
  expect(h.result.current.notice).not.toContain('자동 저장하지 못했습니다');
  h.engine.dispose();
});
function harness() {
  vi.useFakeTimers();
  const details = projectFixture();
  if (!details.revision) throw new Error('저장 버전 fixture 필요');
  const initial = scoreEditingFixture();
  const saved = initial.document;
  const first = saved.tracks[0]?.notes[0];
  if (!first) throw new Error('기본 음표 필요');
  initial.document = editNote(saved, {
    kind: 'UPDATE',
    trackId: first.trackId,
    noteId: first.id,
    value: { startTick: 0, durationTicks: 960, stringIndex: 1, fret: 3 },
  });
  initial.originalAssetId = details.revision.scoreAssetId;
  initial.savedRevision = {
    projectId: details.project.id,
    revisionId: details.revision.revisionId,
    document: saved,
  };
  const save = vi.fn(async () => {});
  const project = {
    native: true,
    details,
    busy: false,
    scoreSaved: false,
    error: null as string | null,
    save,
  };
  const engine = new PlayerEngine();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Context.Provider value={engine}>{children}</Context.Provider>
  );
  const props = { project, session: initial, locked: false };
  const hook = renderHook(
    ({ project, session, locked }) =>
      useScoreAutosave(project, session, locked),
    { initialProps: props, wrapper },
  );
  return { ...hook, props, save, engine };
}
it('기본 꺼짐·적용 변경 후30초 debounce·같은 문서 한 번 저장과 꺼짐 취소를 지킨다', async () => {
  const h = harness();
  await act(async () => vi.advanceTimersByTime(60000));
  expect(h.save).not.toHaveBeenCalled();
  act(() => h.result.current.setEnabled(true));
  await act(async () => vi.advanceTimersByTime(29000));
  const session = {
    ...h.props.session,
    document: { ...h.props.session.document, title: '새 적용 편집' },
  };
  h.rerender({ ...h.props, session });
  await act(async () => vi.advanceTimersByTime(29999));
  expect(h.save).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(h.save).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTime(90000));
  expect(h.save).toHaveBeenCalledTimes(1);
  h.rerender(h.props);
  act(() => h.result.current.setEnabled(false));
  await act(async () => vi.advanceTimersByTime(60000));
  expect(h.save).toHaveBeenCalledTimes(1);
  h.engine.dispose();
});
it('녹음/채점 잠금·파일 작업·기존 오류·최초/다른 원본/버전·저장 완료는 자동 저장하지 않는다', async () => {
  const h = harness();
  act(() => h.result.current.setEnabled(true));
  const initial = h.props.session;
  for (const props of [
    { ...h.props, locked: true },
    { ...h.props, project: { ...h.props.project, native: false } },
    { ...h.props, project: { ...h.props.project, busy: true } },
    { ...h.props, project: { ...h.props.project, error: '저장 오류' } },
    { ...h.props, project: { ...h.props.project, scoreSaved: true } },
    { ...h.props, session: { ...initial, savedRevision: undefined } },
    { ...h.props, session: { ...initial, originalAssetId: '다른 원본' } },
    {
      ...h.props,
      session: {
        ...initial,
        savedRevision: { ...initial.savedRevision!, revisionId: '다른 버전' },
      },
    },
  ]) {
    h.rerender(props);
    await act(async () => vi.advanceTimersByTime(60000));
    expect(h.save).not.toHaveBeenCalled();
  }
  h.rerender(h.props);
  await act(async () => vi.advanceTimersByTime(30000));
  expect(h.save).toHaveBeenCalledTimes(1);
  h.engine.dispose();
});
it('프로젝트 전환·해제는 이전 타이머를 취소하고 실행 직전 재생 상태도 재확인한다', async () => {
  const h = harness();
  act(() => h.result.current.setEnabled(true));
  await act(async () => vi.advanceTimersByTime(29999));
  const playing = { ...h.engine.getSnapshot(), status: 'playing' as const };
  const snapshot = vi.spyOn(h.engine, 'getSnapshot').mockReturnValue(playing);
  await act(async () => vi.advanceTimersByTime(1));
  expect(h.save).not.toHaveBeenCalled();
  snapshot.mockRestore();
  h.rerender({
    ...h.props,
    project: {
      ...h.props.project,
      details: {
        ...h.props.project.details,
        project: { ...h.props.project.details.project, id: '다른 프로젝트' },
      },
    },
  });
  expect(h.result.current.enabled).toBe(false);
  await act(async () => vi.advanceTimersByTime(60000));
  expect(h.save).not.toHaveBeenCalled();
  h.unmount();
  await act(async () => vi.advanceTimersByTime(60000));
  expect(h.save).not.toHaveBeenCalled();
  h.engine.dispose();
});
it('저장 예외는 안내하고 반복하지 않으며 사용자가 다시 켜면 명시적으로 재시도한다', async () => {
  const h = harness();
  h.save.mockRejectedValueOnce(new Error('저장 실패'));
  act(() => h.result.current.setEnabled(true));
  await act(async () => vi.advanceTimersByTime(30000));
  expect(h.result.current.notice).toContain('자동 저장하지 못했습니다');
  await act(async () => vi.advanceTimersByTime(300000));
  expect(h.save).toHaveBeenCalledTimes(1);
  act(() => h.result.current.setEnabled(false));
  act(() => h.result.current.setEnabled(true));
  await act(async () => vi.advanceTimersByTime(30000));
  expect(h.save).toHaveBeenCalledTimes(2);
  h.engine.dispose();
});
