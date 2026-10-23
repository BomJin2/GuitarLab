import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { useScoreEditing } from './useScoreEditing';
import type { ScoreSession } from './scoreSession';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { draftPreview } from '../transcription/transcription';
import { transcriptionFixture } from '../../test/transcriptionFixture';
import { prepareEditingDocument } from './normalizedNotation';
import { getActiveTrackIndex, selectScoreTrack } from './trackSelection';

it('버튼·키보드 공통 이동은 경계를 순환하지 않고 선택만 바꾸며 새 음표/잠금은 유지한다', () => {
  const { result, initial, rerender, engine } = harness();
  const notes = initial.document.tracks[0]!.notes;
  act(() => result.current.editor.begin());
  act(() => result.current.editor.moveSelection('previous'));
  expect(result.current.editor.selectedNote?.id).toBe(notes[0]?.id);
  act(() => result.current.editor.moveSelection('next'));
  expect(result.current.editor.selectedNote?.id).toBe(notes[1]?.id);
  act(() => result.current.editor.moveSelection('last'));
  expect(result.current.editor.selectedNote?.id).toBe(notes.at(-1)?.id);
  act(() => result.current.editor.moveSelection('next'));
  expect(result.current.editor.selectedNote?.id).toBe(notes.at(-1)?.id);
  rerender({ locked: true });
  act(() => result.current.editor.moveSelection('first'));
  expect(result.current.editor.selectedNote?.id).toBe(notes.at(-1)?.id);
  rerender({ locked: false });
  act(() => result.current.editor.moveSelection('first'));
  expect(result.current.editor.selectedNote?.id).toBe(notes[0]?.id);
  act(() => result.current.editor.selectNote(null));
  act(() => result.current.editor.moveSelection('next'));
  expect(result.current.editor.selectedNote).toBeUndefined();
  expect(result.current.session).toBe(initial);
  expect(result.current.editor.canUndo).toBe(false);
  engine.dispose();
});

it('음표 ID 선택은 문서/history를 바꾸지 않고 잠금·없는 ID·삭제/Undo를 안전하게 처리한다', () => {
  const { result, initial, rerender, engine } = harness();
  const track = initial.document.tracks[0]!;
  const second = track.notes[1]!;
  act(() => result.current.editor.selectNote(second.id));
  expect(result.current.editor.selectedNote?.id).toBe(track.notes[0]?.id);
  act(() => result.current.editor.begin());
  act(() => result.current.editor.selectNote(second.id));
  expect(result.current.editor.selectedNote?.id).toBe(second.id);
  expect(result.current.session).toBe(initial);
  expect(result.current.editor.canUndo).toBe(false);
  act(() => result.current.editor.selectNote('없는 ID'));
  expect(result.current.editor.selectedNote?.id).toBe(second.id);
  rerender({ locked: true });
  act(() => result.current.editor.selectNote(null));
  expect(result.current.editor.selectedNote?.id).toBe(second.id);
  rerender({ locked: false });
  act(() =>
    result.current.editor.edit({
      kind: 'DELETE',
      trackId: track.id,
      noteId: second.id,
    }),
  );
  expect(result.current.editor.selectedNote?.id).toBe(track.notes[0]?.id);
  act(() => result.current.editor.undo());
  expect(result.current.editor.selectedNote?.id).toBe(second.id);
  act(() => result.current.editor.selectNote(null));
  expect(result.current.editor.selectedNote).toBeUndefined();
  expect(result.current.session?.document).toBe(initial.document);
  engine.dispose();
});

it('선택은 현재 원본·트랙에 한정하고 새 트랙/악보를 열 때 옛 ID를 적용하지 않는다', () => {
  const { result, initial, engine } = harness();
  act(() => result.current.editor.begin());
  act(() =>
    result.current.editor.selectNote(initial.document.tracks[0]!.notes[1]!.id),
  );
  act(() => result.current.editor.structure({ kind: 'ADD_GUITAR_TRACK' }));
  expect(result.current.editor.selectedNote).toBeUndefined();
  act(() => result.current.editor.undo());
  expect(result.current.editor.selectedNote?.id).toBe(
    initial.document.tracks[0]!.notes[1]!.id,
  );
  const replacement = scoreEditingFixture();
  act(() => result.current.setSession(replacement));
  expect(result.current.editor.enabled).toBe(false);
  expect(result.current.editor.selectedNote?.id).toBe(
    replacement.document.tracks[0]?.notes[0]?.id,
  );
  expect(result.current.editor.canUndo).toBe(false);
  engine.dispose();
});

it('이름 편집·Undo/Redo는 선택 ID·원본/저장 버전을 유지하고 잠금·잘못된 이름은 거부한다', () => {
  const { result, initial, rerender, engine } = harness();
  const track = initial.document.tracks[0]!;
  act(() => result.current.editor.begin());
  const edit = {
    kind: 'SET_TRACK_NAME' as const,
    trackId: track.id,
    name: '내 리드',
  };
  rerender({ locked: true });
  act(() => result.current.editor.structure(edit));
  expect(result.current.session).toBe(initial);
  rerender({ locked: false });
  act(() => result.current.editor.structure({ ...edit, name: ' ' }));
  expect(result.current.editor.error).toContain('1~200');
  expect(result.current.session).toBe(initial);
  act(() => result.current.editor.structure(edit));
  const renamed = result.current.session;
  expect(renamed?.document.tracks[0]?.name).toBe('내 리드');
  expect(renamed?.activePerformanceTrackId).toBe(track.id);
  expect(renamed?.originalBytes).toBe(initial.originalBytes);
  expect(renamed?.savedRevision).toBe(initial.savedRevision);
  act(() => result.current.editor.undo());
  expect(result.current.session?.document).toBe(initial.document);
  act(() => result.current.editor.redo());
  expect(result.current.session?.document).toBe(renamed?.document);
  expect(result.current.session?.activePerformanceTrackId).toBe(track.id);
  engine.dispose();
});

it('새 트랙 선택·음표 추가·Undo 삭제의 선택 복귀와 같은 ID Redo를 원본 보존으로 연결한다', () => {
  const { result, initial, rerender, engine } = harness();
  act(() => result.current.editor.structure({ kind: 'ADD_GUITAR_TRACK' }));
  expect(result.current.session).toBe(initial);
  act(() => result.current.editor.begin());
  rerender({ locked: true });
  act(() => result.current.editor.structure({ kind: 'ADD_GUITAR_TRACK' }));
  expect(result.current.session).toBe(initial);
  rerender({ locked: false });
  act(() => result.current.editor.structure({ kind: 'ADD_GUITAR_TRACK' }));
  const added = result.current.session;
  const track = added?.document.tracks[1];
  if (!added || !track) throw new Error('새 기타 트랙 필요');
  expect(getActiveTrackIndex(added)).toBe(1);
  expect(added.activePerformanceTrackId).toBe(track.id);
  expect(added.document.tracks[0]).toEqual(initial.document.tracks[0]);
  act(() =>
    result.current.editor.edit({
      kind: 'ADD',
      trackId: track.id,
      value: { startTick: 0, durationTicks: 480, stringIndex: 1, fret: 3 },
    }),
  );
  expect(result.current.session?.document.tracks[1]?.notes[0]?.pitchMidi).toBe(
    67,
  );
  expect(result.current.session?.document.tracks[0]?.notes).toEqual(
    initial.document.tracks[0]?.notes,
  );
  act(() => result.current.editor.undo());
  expect(result.current.session?.document).toBe(added.document);
  act(() => result.current.editor.undo());
  expect(result.current.session?.document).toBe(initial.document);
  expect(
    result.current.session && getActiveTrackIndex(result.current.session),
  ).toBe(0);
  act(() => result.current.editor.redo());
  expect(result.current.session?.document).toBe(added.document);
  expect(
    result.current.session && getActiveTrackIndex(result.current.session),
  ).toBe(0);
  act(() =>
    result.current.setSession((session) =>
      session ? selectScoreTrack(session, track.id) : session,
    ),
  );
  act(() => result.current.editor.redo());
  expect(result.current.session?.document.tracks[1]?.notes[0]?.fret).toBe(3);
  expect(result.current.session?.activePerformanceTrackId).toBe(track.id);
  expect(result.current.session?.originalBytes).toBe(initial.originalBytes);
  expect(result.current.session?.savedRevision).toBe(initial.savedRevision);
  act(() => result.current.editor.compareOriginal());
  expect(result.current.editor.originalView?.score.tracks).toHaveLength(1);
  engine.dispose();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function harness(legacy = false) {
  const engine = new PlayerEngine();
  const initial = scoreEditingFixture();
  if (legacy)
    initial.document = {
      ...initial.document,
      tracks: initial.document.tracks.map((t) => ({
        ...t,
        tuningMidi: [...t.tuningMidi].reverse(),
      })),
    };
  initial.savedRevision = {
    projectId: '00000000-0000-4000-8000-000000000001',
    revisionId: '00000000-0000-4000-8000-000000000002',
    document: initial.document,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Context.Provider value={engine}>{children}</Context.Provider>
  );
  return {
    initial,
    engine,
    ...renderHook(
      ({ locked }) => {
        const [session, setSession] = useState<ScoreSession | null>(initial);
        return {
          session,
          setSession,
          editor: useScoreEditing(session, setSession, locked),
        };
      },
      { wrapper, initialProps: { locked: false } },
    ),
  };
}
it('AI 초안을 선택 트랙에 적용하고 Undo/Redo·새 epoch를 연결하며 원본과 저장 리비전을 유지한다', () => {
  const { result, initial, engine, rerender } = harness();
  const preview = draftPreview(initial, transcriptionFixture());
  const other = {
    ...initial.document.tracks[0]!,
    id: 'other',
    name: '다른 기타',
    notes: [],
  };
  const session: ScoreSession = {
    ...initial,
    document: {
      ...prepareEditingDocument(initial),
      renderSource: 'NORMALIZED',
      tracks: [...prepareEditingDocument(initial).tracks, other],
    },
  };
  act(() => result.current.setSession(session));
  const document = draftPreview(session, transcriptionFixture()).document;
  act(() => expect(result.current.editor.replace(document)).toBe(true));
  expect(result.current.editor.enabled).toBe(true);
  expect(result.current.session?.document.tracks[0]?.notes[0]?.source).toBe(
    'ai',
  );
  expect(result.current.session?.document.tracks[1]).toBe(other);
  expect(result.current.session?.originalBytes).toBe(initial.originalBytes);
  expect(result.current.session?.savedRevision).toBe(initial.savedRevision);
  expect(result.current.session?.document.tracks[0]?.name).toBe(
    initial.document.tracks[0]?.name,
  );
  act(() => result.current.editor.undo());
  expect(result.current.session?.document).toBe(session.document);
  act(() => result.current.editor.redo());
  expect(result.current.session?.document).toBe(document);
  expect(engine.getSnapshot().playbackEpoch).toBe(3);
  const unsupported = {
    ...document,
    tracks: document.tracks.map((t, i) =>
      i === 0
        ? { ...t, notes: t.notes.map((n) => ({ ...n, durationTicks: 123 })) }
        : t,
    ),
  };
  act(() => expect(result.current.editor.replace(unsupported)).toBe(false));
  expect(result.current.session?.document).toBe(document);
  rerender({ locked: true });
  act(() =>
    expect(result.current.editor.replace(preview.document)).toBe(false),
  );
  expect(result.current.session?.document).toBe(document);
});
it('이전 역순 튜닝은 원본에서 편집 사본을 만들며 Undo/Redo·epoch와 저장 리비전 원본을 유지한다', () => {
  const { result, initial, engine } = harness(true);
  const track = initial.document.tracks[0];
  const note = track?.notes[0];
  if (!track || !note) throw new Error('테스트 음표 필요');
  const pause = vi.spyOn(engine, 'pause');
  act(() => result.current.editor.begin());
  expect(result.current.editor.enabled).toBe(true);
  expect(result.current.editor.error).toBeNull();
  expect(result.current.session?.document).toBe(initial.document);
  act(() =>
    result.current.editor.edit({
      kind: 'UPDATE',
      trackId: track.id,
      noteId: note.id,
      value: { startTick: 0, durationTicks: 960, stringIndex: 1, fret: 3 },
    }),
  );
  expect(result.current.session?.document.tracks[0]?.tuningMidi).toEqual([
    64, 59, 55, 50, 45, 40,
  ]);
  expect(result.current.session?.document.tracks[0]?.notes[0]?.pitchMidi).toBe(
    67,
  );
  expect(result.current.session?.document).not.toBe(
    initial.savedRevision?.document,
  );
  expect(result.current.session?.savedRevision).toBe(initial.savedRevision);
  expect(result.current.session?.originalBytes).toBe(initial.originalBytes);
  const edited = result.current.session?.document;
  act(() => result.current.editor.undo());
  expect(result.current.session?.document).toBe(initial.document);
  act(() => result.current.editor.redo());
  expect(result.current.session?.document).toBe(edited);
  expect(pause).toHaveBeenCalledTimes(4);
  expect(engine.getSnapshot().playbackEpoch).toBe(4);
  act(() => result.current.editor.compareOriginal());
  expect(
    result.current.editor.originalView?.score.tracks[0]?.staves[0]?.bars[0]
      ?.voices[0]?.beats[0]?.notes[0]?.fret,
  ).toBe(0);
  expect(result.current.session?.document).toBe(edited);
  act(() =>
    result.current.editor.structure({
      kind: 'SET_TUNING',
      trackId: track.id,
      tuningMidi: [62, 59, 55, 50, 45, 40],
    }),
  );
  expect(result.current.session?.document.tracks[0]?.notes[0]?.pitchMidi).toBe(
    65,
  );
  act(() => result.current.editor.undo());
  expect(result.current.session?.document).toBe(edited);
});
it('잠금·잘못된 입력은 문서를 바꾸지 않고 외부 변경의 오래된 history를 적용하지 않는다', () => {
  const { result, initial, rerender } = harness();
  const track = initial.document.tracks[0];
  const note = track?.notes[0];
  if (!track || !note) throw new Error('테스트 음표 필요');
  act(() => result.current.editor.begin());
  const edit = {
    kind: 'UPDATE' as const,
    trackId: track.id,
    noteId: note.id,
    value: { startTick: 0, durationTicks: 960, stringIndex: 1, fret: 3 },
  };
  rerender({ locked: true });
  act(() => result.current.editor.edit(edit));
  expect(result.current.session?.document).toBe(initial.document);
  rerender({ locked: false });
  act(() =>
    result.current.editor.edit({ ...edit, value: { ...edit.value, fret: 90 } }),
  );
  expect(result.current.editor.error).toContain('프렛');
  expect(result.current.session?.document).toBe(initial.document);
  act(() => result.current.editor.edit(edit));
  expect(result.current.editor.canUndo).toBe(true);
  act(() =>
    result.current.setSession((s) =>
      s ? { ...s, document: { ...s.document, title: '외부 변경' } } : s,
    ),
  );
  const external = result.current.session?.document;
  expect(result.current.editor.canUndo).toBe(false);
  act(() => result.current.editor.undo());
  expect(result.current.session?.document).toBe(external);
});
