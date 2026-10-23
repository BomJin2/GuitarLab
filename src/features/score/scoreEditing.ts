import type { ScoreDocument } from '../../entities/score';
import { validateEditable } from './normalizedNotation';

export type NoteDraft = {
  startTick: number;
  durationTicks: number;
  stringIndex: number;
  fret: number;
};
export type NoteEdit =
  | { kind: 'UPDATE'; trackId: string; noteId: string; value: NoteDraft }
  | { kind: 'ADD'; trackId: string; value: NoteDraft }
  | { kind: 'DELETE'; trackId: string; noteId: string };
export function editNote(
  document: ScoreDocument,
  edit: NoteEdit,
): ScoreDocument {
  const bars = validateEditable(document);
  const track = document.tracks.find((t) => t.id === edit.trackId);
  if (
    !track ||
    (edit.kind !== 'ADD' && !track.notes.some((n) => n.id === edit.noteId))
  )
    throw new Error('편집할 트랙이나 음표를 찾을 수 없습니다.');
  let notes = track.notes;
  if (edit.kind === 'DELETE') notes = notes.filter((n) => n.id !== edit.noteId);
  else {
    const value = edit.value;
    if (
      !Number.isInteger(value.stringIndex) ||
      value.stringIndex < 1 ||
      value.stringIndex > 6 ||
      !Number.isInteger(value.fret) ||
      value.fret < 0 ||
      value.fret > 36
    )
      throw new Error('줄은1~6, 프렛은0~36의 정수로 입력하세요.');
    const pitchMidi =
      (track.tuningMidi[value.stringIndex - 1] ?? -100) + value.fret;
    const measureIndex = bars.findIndex(
      (b) => b.start <= value.startTick && value.startTick < b.end,
    );
    const note = {
      ...value,
      id: edit.kind === 'ADD' ? crypto.randomUUID() : edit.noteId,
      trackId: track.id,
      pitchMidi,
      measureIndex,
      attack: true,
      source: 'manual' as const,
    };
    notes =
      edit.kind === 'ADD'
        ? [...notes, note]
        : notes.map((n) => (n.id === edit.noteId ? { ...n, ...note } : n));
  }
  const next: ScoreDocument = {
    ...document,
    renderSource: 'NORMALIZED',
    tracks: document.tracks.map((t) => ({
      ...t,
      notes: [...(t.id === track.id ? notes : t.notes)]
        .sort((a, b) => a.startTick - b.startTick)
        .map((n) => ({
          ...n,
          measureIndex: bars.findIndex(
            (b) => b.start <= n.startTick && n.startTick < b.end,
          ),
        })),
    })),
  };
  validateEditable(next);
  return next;
}
export type EditHistory = {
  past: ScoreDocument[];
  present: ScoreDocument;
  future: ScoreDocument[];
};
export function commitEdit(
  history: EditHistory,
  document: ScoreDocument,
): EditHistory {
  return {
    past: [...history.past, history.present].slice(-100),
    present: document,
    future: [],
  };
}
export function undoEdit(history: EditHistory): EditHistory {
  const previous = history.past.at(-1);
  return previous
    ? {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      }
    : history;
}
export function redoEdit(history: EditHistory): EditHistory {
  const next = history.future[0];
  return next
    ? {
        past: [...history.past, history.present].slice(-100),
        present: next,
        future: history.future.slice(1),
      }
    : history;
}
