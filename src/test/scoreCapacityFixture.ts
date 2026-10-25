import type { NoteEvent, ScoreDocument } from '../entities/score';
import { prepareEditingDocument } from '../features/score/normalizedNotation';
import { scoreEditingFixture } from './scoreEditingFixture';

export function scoreCapacityFixture(
  trackCount: number,
  numerator = 4,
  denominator = 4,
): ScoreDocument {
  const original = prepareEditingDocument(scoreEditingFixture());
  const track = original.tracks[0];
  if (!track) throw new Error('자체 기타 트랙이 필요합니다.');
  const barTicks = (3840 * numerator) / denominator;
  return {
    ...original,
    renderSource: 'NORMALIZED',
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignatures: Array.from({ length: 256 }, (_, index) => ({
      tick: index * barTicks,
      numerator,
      denominator,
    })),
    tracks: Array.from({ length: trackCount }, (_, index) => {
      const id = `capacity-track-${index}`;
      const notes: NoteEvent[] = [];
      for (let i = index; i < 2000; i += trackCount) {
        const startTick = Math.floor(i / trackCount) * 480;
        const fret = i % 12;
        notes.push({
          id: `capacity-note-${i}`,
          trackId: id,
          startTick,
          durationTicks: 480,
          measureIndex: Math.floor(startTick / barTicks),
          pitchMidi: 64 + fret,
          stringIndex: 1,
          fret,
          attack: true,
          source: 'manual',
        });
      }
      return { ...track, id, name: `자체 기타 ${index + 1}`, notes };
    }),
  };
}
