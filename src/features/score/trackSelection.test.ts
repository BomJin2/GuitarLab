import { expect, it } from 'vitest';
import { dualGuitarSession } from '../../test/dualGuitarFixture';
import { buildPracticeTargets } from '../practice/practice';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import {
  getActiveTrackIndex,
  importedInstrument,
  scoreTrackEntries,
  selectScoreTrack,
  setGuitarRole,
} from './trackSelection';

it('두 기타 원본의 서로 다른 TAB·커서·8개 목표를 선택 ID로 독립 연결한다', () => {
  const session = dualGuitarSession();
  expect(scoreTrackEntries(session).map((entry) => entry.instrument)).toEqual([
    'GUITAR',
    'GUITAR',
  ]);
  const second = session.document.tracks[1];
  if (!second) throw new Error('두 번째 기타 없음');
  const selected = selectScoreTrack(session, second.id);
  const lead = buildPracticeTargets(
    session.document,
    getActiveTrackIndex(session),
    4000,
    null,
  );
  const rhythm = buildPracticeTargets(
    selected.document,
    getActiveTrackIndex(selected),
    4000,
    null,
  );
  expect(lead).toHaveLength(8);
  expect(rhythm).toHaveLength(8);
  expect(lead.map((note) => note.pitchMidi)).toEqual([
    64, 67, 69, 71, 64, 67, 69, 71,
  ]);
  expect(rhythm.map((note) => note.pitchMidi)).toEqual([
    40, 45, 50, 55, 40, 45, 50, 55,
  ]);
  expect(
    rhythm.every((note) => !lead.some((other) => other.id === note.id)),
  ).toBe(true);
  expect(
    session.playbackLookup.findBeat(new Set([0]), 960)?.beat.notes[0]
      ?.realValue,
  ).toBe(67);
  expect(
    selected.playbackLookup.findBeat(new Set([1]), 960)?.beat.notes[0]
      ?.realValue,
  ).toBe(45);
  expect(selected.document).toBe(session.document);
  expect(() => selectScoreTrack(session, 'missing-track')).toThrow();
});

it('역할 수정은 다른 기타 음표·원본을 보존하고 구형 악보도 읽는다', () => {
  const session = dualGuitarSession();
  const first = session.document.tracks[0];
  const second = session.document.tracks[1];
  if (!first || !second) throw new Error('기타 트랙 없음');
  expect(first.role).toBe('UNKNOWN');
  const edited = setGuitarRole(session.document, second.id, 'RHYTHM');
  expect(edited.tracks[0]).toBe(first);
  expect(edited.tracks[1]?.notes).toBe(second.notes);
  expect(edited.tracks[1]?.role).toBe('RHYTHM');
  expect(second.role).toBe('UNKNOWN');
  expect(session.score.tracks[1]?.name).toMatch(/^Guitar\s2$/u);
  const legacy = {
    ...session.document,
    tracks: session.document.tracks.map(({ instrument, role, ...track }) => {
      expect(instrument).toBe('GUITAR');
      expect(role).toBe('UNKNOWN');
      return track;
    }),
  };
  expect(decodeScoreDocument(legacy).tracks).toHaveLength(2);
  expect(() =>
    decodeScoreDocument({
      ...edited,
      tracks: [{ ...first, role: 'AUTOMATIC_LEAD' }, second],
    }),
  ).toThrow();
  expect(() =>
    decodeScoreDocument({
      ...edited,
      tracks: [{ ...first, instrument: 'AUDIO_STEM' }, second],
    }),
  ).toThrow();
});

it('기타 이름만으로 베이스·타악을 기타로 분류하지 않고 저장 ID를 우선한다', () => {
  const session = dualGuitarSession();
  const original = session.score.tracks[0];
  const second = session.document.tracks[1];
  if (!original || !second || !original.staves[0])
    throw new Error('원본 트랙 없음');
  original.playbackInfo.program = 32;
  expect(importedInstrument(original)).toBe('OTHER');
  original.playbackInfo.program = 24;
  original.staves[0].isPercussion = true;
  expect(importedInstrument(original)).toBe('OTHER');
  expect(
    getActiveTrackIndex({
      ...session,
      activeTrackIndex: 0,
      activePerformanceTrackId: second.id,
    }),
  ).toBe(1);
  expect(() =>
    getActiveTrackIndex({ ...session, activePerformanceTrackId: 'missing' }),
  ).toThrow();
});
