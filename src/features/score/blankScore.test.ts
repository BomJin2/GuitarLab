import { expect, it } from 'vitest';
import { blankScoreFile } from './blankScore';
import { importLocalMedia } from './localMediaImport';
import { editNote } from './scoreEditing';
import {
  renderNormalized,
  renderStoredScore,
  toNormalizedMusicXml,
} from './normalizedNotation';

it('실제 빈 MusicXML에서 수동 음표를 작성하고 렌더/출력/재열기의 음정·원본을 보존한다', async () => {
  const result = await importLocalMedia(
    'score',
    blankScoreFile(),
    new AbortController().signal,
  );
  if (result.kind !== 'score') throw new Error('악보 결과 없음');
  const session = result.session;
  const original = session.originalBytes.slice();
  expect(session.score.masterBars).toHaveLength(1);
  expect(session.document.tempoMap).toEqual([{ tick: 0, bpm: 120 }]);
  expect(session.document.syncAnchors).toEqual([
    { scoreTick: 0, audioTimeMs: 0 },
    { scoreTick: 3840, audioTimeMs: 2000 },
  ]);
  const track = session.document.tracks[0];
  if (!track) throw new Error('빈 기타 트랙 없음');
  expect(track.instrument).toBe('GUITAR');
  expect(track.tuningMidi).toEqual([64, 59, 55, 50, 45, 40]);
  expect(track.notes).toEqual([]);
  expect(renderNormalized(session.document).score.masterBars).toHaveLength(1);
  const edited = editNote(session.document, {
    kind: 'ADD',
    trackId: track.id,
    value: { startTick: 0, durationTicks: 960, stringIndex: 6, fret: 3 },
  });
  const roundTrip = renderStoredScore(
    JSON.parse(JSON.stringify(edited)),
    original,
  );
  expect(
    roundTrip.score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0]
      ?.realValue,
  ).toBe(43);
  const exported = await importLocalMedia(
    'score',
    new File([toNormalizedMusicXml(edited)], '새 악보.musicxml'),
    new AbortController().signal,
  );
  if (exported.kind !== 'score') throw new Error('출력 재열기 없음');
  expect(exported.session.document.tracks[0]?.notes[0]).toMatchObject({
    pitchMidi: 43,
    stringIndex: 6,
    fret: 3,
    startTick: 0,
    durationTicks: 960,
  });
  expect(session.originalBytes).toEqual(original);
  expect(track.notes).toEqual([]);
});
