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
        for (const staff of display.score.tracks[index]!.staves) {
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
