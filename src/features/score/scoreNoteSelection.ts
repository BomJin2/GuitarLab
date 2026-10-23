import type { model } from '@coderline/alphatab';
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
        entry.pitchMidi === note.realValue &&
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
