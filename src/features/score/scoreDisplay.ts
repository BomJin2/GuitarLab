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
    // 보이는 줄(표준 악보·TAB)은 createDisplayScore가 정합니다. Tab·Score 프로필은 주법 표시 층을 빼므로
    // (alphaTab 1.6.1 createDefaultStaveProfiles) Default를 써서 P.M.·비브라토·태핑 등을 그립니다(docs/12 주법 편집 v1).
    staveProfile: StaveProfile.Default,
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
  const originalTrack = source.tracks[trackIndex];
  if (!originalTrack) throw new Error('악보 표시 트랙이 없습니다.');
  // 직렬화 전용 복사본은 읽기만 하며 원래 트랙의 부모 연결을 바꾸지 않습니다.
  const serializationSource = Object.assign(new model.Score(), source, {
    tracks: [originalTrack],
  });
  const score = model.JsonConverter.jsObjectToScore(
    model.JsonConverter.scoreToJsObject(serializationSource),
  );
  const track = score.tracks[0];
  if (!track) throw new Error('악보 표시 트랙이 없습니다.');
  for (const key of [
    'perTrackDisplayTuning',
    'perTrackChordDiagramsOnTop',
  ] as const) {
    const value = source.stylesheet[key]?.get(trackIndex);
    score.stylesheet[key] = value === undefined ? null : new Map([[0, value]]);
  }
  score.stylesheet.perTrackMultiBarRest =
    source.stylesheet.perTrackMultiBarRest === null
      ? null
      : new Set(
          source.stylesheet.perTrackMultiBarRest.has(trackIndex) ? [0] : [],
        );
  const notes = new Map<model.Note, model.Note>();
  const beats = new Map<model.Beat, model.Beat>();
  // 같은 선율의 오선보(줄 없음)·TAB(줄 있음) 짝이면 오선보 보기에서 TAB 쪽 오선보를 숨겨 중복을 막습니다.
  // 내용이 다른 다중 보표는 그대로 둡니다(2026-11-08 리뷰).
  const notationOnly = new Set(
    track.staves.filter((s) => s.tuning.length === 0).map(staffSignature),
  );
  for (const [staffIndex, staff] of track.staves.entries()) {
    const twin =
      staff.tuning.length > 0 && notationOnly.has(staffSignature(staff));
    staff.showStandardNotation = notation === 'score' && !twin;
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
  return { score, renderTrackIndex: 0, notes, beats };
}
/** 보표 내용 지문: 마디마다 소리 나는 음(시각·길이·음정) 집합. 성부 번호·쉼표는 보지 않습니다(MusicXML TAB 보표는 성부 번호가 다를 수 있음). */
function staffSignature(staff: model.Staff) {
  return JSON.stringify(
    staff.bars.map((bar) =>
      bar.voices
        .flatMap((voice) =>
          voice.beats.flatMap((beat) =>
            beat.notes.map(
              (note) =>
                `${beat.playbackStart}:${beat.playbackDuration}:${note.realValue}`,
            ),
          ),
        )
        .sort(),
    ),
  );
}
