import { importer, model } from '@coderline/alphatab';
import { expect, it } from 'vitest';
import xml from '../../../public/fixtures/standard.musicxml?raw';
import dual from '../../../public/fixtures/dual-guitar.musicxml?raw';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
} from './alphaTabAdapter';
import { createDisplayScore } from './scoreDisplay';
import { renderedNoteId } from './scoreNoteSelection';
import { scoreCapacityFixture } from '../../test/scoreCapacityFixture';
import { renderNormalized } from './normalizedNotation';

it('128트랙 중 마지막 트랙만 복사하고 트랙별 표기·원래 객체/시간/문서를 보존한다', () => {
  const capacity = scoreCapacityFixture(128);
  const document = {
    ...capacity,
    timeSignatures: capacity.timeSignatures.slice(0, 4),
  };
  const { score } = renderNormalized(document);
  score.title = '표시 원본 제목';
  score.artist = '자체 연주자';
  score.tempo = 95;
  score.stylesheet.perTrackDisplayTuning = new Map([
    [0, true],
    [127, false],
  ]);
  score.stylesheet.perTrackChordDiagramsOnTop = new Map([[127, true]]);
  score.stylesheet.perTrackMultiBarRest = new Set([127]);
  const before = model.JsonConverter.scoreToJson(score);
  const display = createDisplayScore(score, 127, 'tab');
  expect(display.score.tracks).toHaveLength(1);
  expect([
    display.score.title,
    display.score.artist,
    display.score.tempo,
  ]).toEqual([score.title, score.artist, score.tempo]);
  expect(display.score.tracks[0]?.name).toBe(score.tracks[127]?.name);
  expect(score.tracks[127]?.score).toBe(score);
  expect(score.tracks[127]?.index).toBe(127);
  expect(display.score.tracks[0]?.staves[0]?.bars).toHaveLength(4);
  expect([...(display.score.stylesheet.perTrackDisplayTuning ?? [])]).toEqual([
    [0, false],
  ]);
  expect([
    ...(display.score.stylesheet.perTrackChordDiagramsOnTop ?? []),
  ]).toEqual([[0, true]]);
  expect([...(display.score.stylesheet.perTrackMultiBarRest ?? [])]).toEqual([
    0,
  ]);
  expect(display.renderTrackIndex).toBe(0);
  expect(display.notes.size).toBe(document.tracks[127]?.notes.length);
  for (const original of display.notes.values())
    expect(original.beat.voice.bar.staff.track.index).toBe(127);
  expect(
    buildPlaybackLookup(display.score).masterBars.map((bar) => bar.start),
  ).toEqual(buildPlaybackLookup(score).masterBars.map((bar) => bar.start));
  expect(model.JsonConverter.scoreToJson(score)).toBe(before);
  const absent = createDisplayScore(score, 1, 'score');
  expect(absent.score.stylesheet.perTrackDisplayTuning).toBeNull();
  expect(absent.score.stylesheet.perTrackChordDiagramsOnTop).toBeNull();
  expect([...(absent.score.stylesheet.perTrackMultiBarRest ?? [])]).toEqual([]);
});

it.each([xml, dual])(
  'TAB 전용 원본은 불변이고 표시 복사본의 음표/박자는 원래 ID와 연결한다',
  (text) => {
    const originalBytes = new TextEncoder().encode(text);
    const score = importScore(originalBytes);
    const playbackLookup = buildPlaybackLookup(score);
    const document = normalizeScore(score, playbackLookup);
    const raw = model.JsonConverter.scoreToJson(score);
    const documentBefore = JSON.stringify(document);
    for (const [index] of score.tracks.entries()) {
      for (const notation of ['tab', 'score'] as const) {
        const display = createDisplayScore(score, index, notation);
        expect(display.score).not.toBe(score);
        const session = {
          score,
          document,
          playbackLookup,
          originalBytes,
          activeTrackIndex: index,
        };
        expect(display.score.tracks).toHaveLength(1);
        expect(display.renderTrackIndex).toBe(0);
        for (const staff of display.score.tracks[0]!.staves) {
          expect(staff.showStandardNotation).toBe(notation === 'score');
          expect(staff.showTablature).toBe(notation === 'tab');
          for (const bar of staff.bars)
            for (const voice of bar.voices)
              for (const beat of voice.beats) {
                for (const note of beat.notes) {
                  const original = display.notes.get(note);
                  if (!original) throw new Error('원래 음표 연결 필요');
                  expect(original).not.toBe(note);
                  expect(display.beats.get(original.beat)).toBe(beat);
                  expect(renderedNoteId(session, original, 0)).not.toBeNull();
                }
              }
        }
      }
    }
    expect(model.JsonConverter.scoreToJson(score)).toBe(raw);
    expect(JSON.stringify(document)).toBe(documentBefore);
  },
);

it('쉼표·화음·반복의 직접 객체 관계와 원본 경계를 유지한다', () => {
  const source = importer.ScoreLoader.loadAlphaTex(
    '. 0.1.4 r.4 (3.1 5.2).4 | 7.1.1',
  );
  source.masterBars[0]!.isRepeatStart = true;
  source.masterBars[0]!.repeatCount = 2;
  source.rebuildRepeatGroups();
  const lookup = buildPlaybackLookup(source);
  const result = createDisplayScore(source, 0, 'score');
  expect(
    buildPlaybackLookup(result.score).masterBars.map((entry) => entry.start),
  ).toEqual(lookup.masterBars.map((entry) => entry.start));
  const beats = source.tracks[0]!.staves[0]!.bars.flatMap((bar) =>
    bar.voices.flatMap((voice) => voice.beats),
  );
  for (const beat of beats) {
    const copy = result.beats.get(beat);
    expect(copy !== beat).toBe(true);
    expect(copy?.notes.length).toBe(beat.notes.length);
    for (const [i, note] of beat.notes.entries())
      expect(result.notes.get(copy!.notes[i]!) === note).toBe(true);
  }
  expect(() => createDisplayScore(source, -1, 'tab')).toThrow('악보 표시 트랙');
});
