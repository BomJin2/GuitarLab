import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ScoreSession } from './scoreSession';
import type { ScoreDocument } from '../../entities/score';
import { usePlayerEngine } from '../player/usePlayer';
import {
  renderNormalized,
  renderStoredScore,
  validateEditable,
  prepareEditingDocument,
  renderOriginalScore,
} from './normalizedNotation';
import {
  commitEdit,
  editNote,
  redoEdit,
  undoEdit,
  type EditHistory,
  type NoteEdit,
} from './scoreEditing';
import { editStructure, type StructureEdit } from './scoreStructure';
import { getActiveTrackIndex, selectScoreTrack } from './trackSelection';
import type { NoteNavigation } from './scoreNoteSelection';

export function useScoreEditing(
  session: ScoreSession | null,
  setSession: Dispatch<SetStateAction<ScoreSession | null>>,
  locked: boolean,
) {
  const engine = usePlayerEngine();
  const history = useRef<EditHistory | null>(null);
  const [armedOriginal, setArmedOriginal] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    source: Uint8Array;
    trackId: string;
    noteId: string | null;
  } | null>(null);
  const [originalView, setOriginalView] = useState<
    ({ source: Uint8Array } & ReturnType<typeof renderOriginalScore>) | null
  >(null);
  const enabled = !!session && armedOriginal === session.originalBytes;
  const currentHistory =
    session?.document === history.current?.present ? history.current : null;
  const activeTrack = session?.document.tracks[getActiveTrackIndex(session)];
  const currentSelection =
    selection?.source === session?.originalBytes &&
    selection?.trackId === activeTrack?.id
      ? selection
      : null;
  const selectedNote =
    currentSelection?.noteId === null
      ? undefined
      : (activeTrack?.notes.find((n) => n.id === currentSelection?.noteId) ??
        activeTrack?.notes[0]);
  function apply(
    document: ScoreDocument,
    nextHistory: EditHistory,
    preferredTrackId?: string,
  ) {
    if (!session || locked) return;
    const rendered = renderStoredScore(document, session.originalBytes);
    const currentId =
      preferredTrackId ??
      session.document.tracks[getActiveTrackIndex(session)]?.id;
    const selected =
      document.tracks.find((track) => track.id === currentId) ??
      document.tracks[0];
    if (!selected) throw new Error('선택할 악보 트랙이 없습니다.');
    const nextSession = selectScoreTrack(
      { ...session, ...rendered, document },
      selected.id,
    );
    engine.pause();
    history.current = nextHistory;
    setSession(nextSession);
    setError(null);
  }
  function run(action: () => void) {
    if (locked || !session) return;
    try {
      action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '편집을 적용하지 못했습니다. 이전 악보를 유지했습니다.',
      );
    }
  }
  function change(
    update: (document: ScoreDocument) => ScoreDocument,
    selectLastTrack = false,
  ) {
    run(() => {
      if (!enabled || !session) return;
      const base = currentHistory ?? {
        past: [],
        present: session.document,
        future: [],
      };
      const document = update(prepareEditingDocument(session));
      apply(
        document,
        commitEdit(base, document),
        selectLastTrack ? document.tracks.at(-1)?.id : undefined,
      );
    });
  }
  function selectNote(noteId: string | null) {
    if (
      locked ||
      !enabled ||
      !session ||
      !activeTrack ||
      (noteId !== null && !activeTrack.notes.some((n) => n.id === noteId))
    )
      return;
    engine.pause();
    setSelection({
      source: session.originalBytes,
      trackId: activeTrack.id,
      noteId,
    });
  }
  return {
    enabled,
    error,
    selectedNote,
    selectNote,
    moveSelection: (direction: NoteNavigation) => {
      if (!activeTrack || !selectedNote) return;
      const index = activeTrack.notes.findIndex(
        (n) => n.id === selectedNote.id,
      );
      const target =
        direction === 'first'
          ? 0
          : direction === 'last'
            ? activeTrack.notes.length - 1
            : index + (direction === 'next' ? 1 : -1);
      const note = activeTrack.notes[target];
      if (note && note.id !== selectedNote.id) selectNote(note.id);
    },
    originalView:
      originalView?.source === session?.originalBytes ? originalView : null,
    compareOriginal: () =>
      run(() => {
        if (!session) return;
        const rendered = renderOriginalScore(session.originalBytes);
        engine.pause();
        setOriginalView({ source: session.originalBytes, ...rendered });
        setError(null);
      }),
    closeComparison: () => setOriginalView(null),
    canUndo: enabled && !!currentHistory?.past.length,
    canRedo: enabled && !!currentHistory?.future.length,
    begin: () =>
      run(() => {
        if (!session) return;
        const document = prepareEditingDocument(session);
        validateEditable(document);
        renderNormalized(document);
        history.current = { past: [], present: session.document, future: [] };
        engine.pause();
        setArmedOriginal(session.originalBytes);
        setError(null);
      }),
    document: enabled && session ? prepareEditingDocument(session) : null,
    replace: (document: ScoreDocument) => {
      let applied = false;
      run(() => {
        if (!session) return;
        const base = currentHistory ?? {
          past: [],
          present: session.document,
          future: [],
        };
        // 렌더 검증을 먼저 끝낸 apply가 성공할 때만 history와 편집 상태를 엽니다.
        validateEditable(document);
        apply(document, commitEdit(base, document));
        setArmedOriginal(session.originalBytes);
        applied = true;
      });
      return applied;
    },
    edit: (edit: NoteEdit) => change((document) => editNote(document, edit)),
    structure: (edit: StructureEdit) =>
      change(
        (document) => editStructure(document, edit),
        edit.kind === 'ADD_GUITAR_TRACK',
      ),
    undo: () =>
      run(() => {
        if (!enabled || !currentHistory) return;
        const next = undoEdit(currentHistory);
        if (next !== currentHistory) apply(next.present, next);
      }),
    redo: () =>
      run(() => {
        if (!enabled || !currentHistory) return;
        const next = redoEdit(currentHistory);
        if (next !== currentHistory) apply(next.present, next);
      }),
  };
}
export type ScoreEditingController = ReturnType<typeof useScoreEditing>;
