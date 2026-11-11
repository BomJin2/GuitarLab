import { model } from '@coderline/alphatab';
import type { ScoreSession } from './scoreSession';
import { getActiveTrackIndex } from './trackSelection';

export type NoteNavigation = 'previous' | 'next' | 'first' | 'last';

export function renderedNoteId(
  session: ScoreSession,
  note: model.Note,
  tick: number,
): string | null {
  if (!Number.isFinite(tick)) return null;
  const index = getActiveTrackIndex(session);
  const bar = note.beat.voice.bar;
  const staff = bar.staff;
  if (
    staff.track !== session.score.tracks[index] ||
    staff.bars[bar.index] !== bar ||
    !bar.voices.includes(note.beat.voice) ||
    !note.beat.voice.beats.includes(note.beat) ||
    !note.beat.notes.includes(note)
  )
    return null;
  // 자연 하모닉: 지원되는 음은 정규화가 프렛 음정, 미지원 음은 소리 음정으로 둡니다(alphaTabAdapter). 둘 다 받습니다.
  const pitches =
    note.harmonicType === model.HarmonicType.Natural
      ? [note.realValueWithoutHarmonic, note.realValue]
      : [note.realValue];
  const starts = new Set(
    session.playbackLookup.masterBars
      .filter((entry) => entry.masterBar === bar.masterBar)
      .map((entry) => entry.start + note.beat.playbackStart),
  );
  const matches = session.document.tracks[index]?.notes
    .filter(
      (entry) =>
        entry.measureIndex === bar.index &&
        starts.has(entry.startTick) &&
        entry.durationTicks === Math.max(1, note.beat.playbackDuration) &&
        pitches.includes(entry.pitchMidi) &&
        entry.stringIndex === staff.tuning.length - note.string + 1 &&
        entry.fret === note.fret,
    )
    .sort(
      (a, b) =>
        Math.abs(a.startTick - tick) - Math.abs(b.startTick - tick) ||
        a.startTick - b.startTick,
    );
  const first = matches?.[0];
  return first && first.startTick !== matches?.[1]?.startTick ? first.id : null;
}
