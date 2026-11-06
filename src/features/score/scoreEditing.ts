import {
  linkTargets,
  linkTechniques,
  techniqueOrder,
  type NoteEvent,
  type ScoreDocument,
  type Technique,
} from '../../entities/score';
import { validateEditable } from './normalizedNotation';

export type NoteDraft = {
  startTick: number;
  durationTicks: number;
  stringIndex: number;
  fret: number;
  /** docs/12 "주법 편집 v1": 주면 그대로 바꿉니다(빈 목록은 주법 없음). 안 주면 기존 값을 둡니다. */
  techniques?: Technique[];
  bendSemitones?: 1 | 2;
};
/** 주법 칸 값을 저장 규칙(정해진 순서, BEND일 때만 벤딩 양)에 맞춥니다. */
function applyTechniques(note: NoteEvent, draft: NoteDraft): NoteEvent {
  if (draft.techniques === undefined) return note;
  const next = { ...note };
  delete next.techniques;
  delete next.bendSemitones;
  const list = techniqueOrder.filter((t) => draft.techniques?.includes(t));
  if (!list.length) return next;
  if (list.filter((t) => linkTechniques.includes(t)).length > 1)
    throw new Error('해머온·슬라이드는 한 음에 하나만 고르세요.');
  if (list.includes('BEND') && draft.bendSemitones === undefined)
    throw new Error('벤딩은 반음 또는 온음을 고르세요.');
  return {
    ...next,
    techniques: list,
    ...(list.includes('BEND') ? { bendSemitones: draft.bendSemitones } : {}),
  };
}
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
      startTick: value.startTick,
      durationTicks: value.durationTicks,
      stringIndex: value.stringIndex,
      fret: value.fret,
      id: edit.kind === 'ADD' ? crypto.randomUUID() : edit.noteId,
      trackId: track.id,
      pitchMidi,
      measureIndex,
      attack: true,
      source: 'manual' as const,
    };
    notes =
      edit.kind === 'ADD'
        ? [...notes, applyTechniques(note, value)]
        : notes.map((n) => {
            if (n.id !== edit.noteId) return n;
            const updated: NoteEvent = applyTechniques(
              { ...n, ...note },
              value,
            );
            // 위치·길이를 바꾸면 사용자가 정한 시각이므로 소리 시각(스윙)을 지웁니다(docs/12 playbackTick v1).
            if (
              n.startTick !== value.startTick ||
              n.durationTicks !== value.durationTicks
            )
              delete updated.playbackTick;
            return updated;
          });
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
  // 이음(해머온·슬라이드)은 같은 줄의 다음 음이 있어야 합니다. 도착 음을 지우거나 옮길 때도 확인합니다.
  if ([...linkTargets(notes).values()].includes(undefined))
    throw new Error(
      '해머온·슬라이드 음 뒤에 같은 줄의 다음 음이 있어야 합니다. 주법을 먼저 해제하세요.',
    );
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
