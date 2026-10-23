import { LayoutMode, StaveProfile, model } from '@coderline/alphatab';

export const scoreScales = [0.75, 1, 1.25, 1.5] as const;
export interface ScoreDisplaySettings {
  notation: 'tab' | 'score';
  layout: 'page' | 'horizontal';
  scale: (typeof scoreScales)[number];
}
export const defaultScoreDisplay: ScoreDisplaySettings = {
  notation: 'tab',
  layout: 'page',
  scale: 1,
};

export function alphaTabDisplay(settings: ScoreDisplaySettings) {
  return {
    staveProfile:
      settings.notation === 'tab' ? StaveProfile.Tab : StaveProfile.Score,
    layoutMode:
      settings.layout === 'page' ? LayoutMode.Page : LayoutMode.Horizontal,
    scale: settings.scale,
  };
}

export function createDisplayScore(
  source: model.Score,
  trackIndex: number,
  notation: ScoreDisplaySettings['notation'],
) {
  const score = model.JsonConverter.jsObjectToScore(
    model.JsonConverter.scoreToJsObject(source),
  );
  const track = score.tracks[trackIndex];
  const originalTrack = source.tracks[trackIndex];
  if (!track || !originalTrack) throw new Error('악보 표시 트랙이 없습니다.');
  const notes = new Map<model.Note, model.Note>();
  const beats = new Map<model.Beat, model.Beat>();
  for (const [staffIndex, staff] of track.staves.entries()) {
    staff.showStandardNotation = notation === 'score';
    staff.showTablature = notation === 'tab' && staff.tuning.length > 0;
    staff.showSlash = false;
    staff.showNumbered = false;
    for (const [barIndex, bar] of staff.bars.entries())
      for (const [voiceIndex, voice] of bar.voices.entries())
        for (const [beatIndex, beat] of voice.beats.entries()) {
          const original =
            originalTrack.staves[staffIndex]?.bars[barIndex]?.voices[voiceIndex]
              ?.beats[beatIndex];
          if (
            !original ||
            original.notes.length !== beat.notes.length ||
            original.playbackStart !== beat.playbackStart ||
            original.playbackDuration !== beat.playbackDuration
          )
            throw new Error('악보 표시 박자가 원본과 다릅니다.');
          beats.set(original, beat);
          for (const [noteIndex, note] of beat.notes.entries()) {
            const originalNote = original.notes[noteIndex];
            if (
              !originalNote ||
              originalNote.realValue !== note.realValue ||
              originalNote.string !== note.string ||
              originalNote.fret !== note.fret
            )
              throw new Error('악보 표시 음표가 원본과 다릅니다.');
            notes.set(note, originalNote);
          }
        }
  }
  return { score, notes, beats };
}
