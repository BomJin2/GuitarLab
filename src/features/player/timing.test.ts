import { describe, it, expect } from 'vitest';
import { countInSeconds, tempoFromAnchors, timingAt } from './timing';
import type { ScoreDocument } from '../../entities/score';
const document: ScoreDocument = {
  schemaVersion: 1,
  id: 'test',
  title: '템포 변경',
  ppq: 960,
  tempoMap: [
    { tick: 0, bpm: 90 },
    { tick: 3840, bpm: 120 },
  ],
  timeSignatures: [
    { tick: 0, numerator: 3, denominator: 4 },
    { tick: 3840, numerator: 6, denominator: 8 },
  ],
  syncAnchors: [
    { scoreTick: 0, audioTimeMs: 0 },
    { scoreTick: 3840, audioTimeMs: 8000 / 3 },
    { scoreTick: 7680, audioTimeMs: 14000 / 3 },
  ],
  tracks: [],
};
describe('악보 박자와 카운트인', () => {
  it('90 BPM 3/4 한 마디는 2초이고 0.5배속은 4초이다', () => {
    expect(
      countInSeconds(1, { bpm: 90, numerator: 3, denominator: 4 }, 1),
    ).toBe(2);
    expect(
      countInSeconds(1, { bpm: 90, numerator: 3, denominator: 4 }, 0.5),
    ).toBe(4);
  });
  it('6/8은 분모를 반영한 6개 eighth 클릭이다', () => {
    expect(
      countInSeconds(2, { bpm: 120, numerator: 6, denominator: 8 }, 1),
    ).toBe(3);
  });
  it('현재 앵커 구간과 박자 변경을 사용한다', () => {
    expect(tempoFromAnchors(document.syncAnchors, 0, 960)).toBeCloseTo(90);
    expect(timingAt(document, 3000).bpm).toBeCloseTo(120);
    expect(timingAt(document, 3000)).toMatchObject({
      numerator: 6,
      denominator: 8,
    });
  });
  it('NaN·과도한 템포·잘못된 박자·잘못된 rate를 거부한다', () => {
    expect(() =>
      countInSeconds(1, { bpm: NaN, numerator: 4, denominator: 4 }, 1),
    ).toThrow();
    expect(() =>
      countInSeconds(1, { bpm: 601, numerator: 4, denominator: 4 }, 1),
    ).toThrow();
    expect(() =>
      countInSeconds(1, { bpm: 120, numerator: 0, denominator: 4 }, 1),
    ).toThrow();
    expect(() =>
      countInSeconds(1, { bpm: 120, numerator: 4, denominator: 3 }, 1),
    ).toThrow();
    expect(() =>
      countInSeconds(1, { bpm: 120, numerator: 4, denominator: 4 }, 2),
    ).toThrow();
  });
});

it('5초 인트로를 적용하면 첫 마디 박자 원점도 5초 이동한다', () => {
  const shifted = {
    ...document,
    syncAnchors: document.syncAnchors.map((a) => ({
      ...a,
      audioTimeMs: a.audioTimeMs + 5000,
    })),
  };
  expect(timingAt(shifted, 0).beatOriginMs).toBe(5000);
  expect(timingAt(shifted, 8000).beatOriginMs).toBeCloseTo(5000 + 8000 / 3);
});
