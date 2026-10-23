import { describe, it, expect } from 'vitest';
import {
  audioTimeToScoreTick,
  scoreTickToAudioTime,
  validateAnchors,
  validateLoop,
} from './sync';
const anchors = [
  { scoreTick: 0, audioTimeMs: 5000 },
  { scoreTick: 3840, audioTimeMs: 7000 },
];
describe('싱크와 반복 계약', () => {
  it('인트로·왕복·영역 외 선형 연장을 유지한다', () => {
    for (const tick of [0, 960, 3840, 7680])
      expect(
        audioTimeToScoreTick(anchors, scoreTickToAudioTime(anchors, tick)),
      ).toBeCloseTo(tick);
    expect(audioTimeToScoreTick(anchors, 0)).toBe(-9600);
  });
  it('역전·중복·NaN·음수·부족 앵커를 거부한다', () => {
    for (const input of [
      [],
      [anchors[0]!],
      [
        { scoreTick: 0, audioTimeMs: 0 },
        { scoreTick: 0, audioTimeMs: 100 },
      ],
      [
        { scoreTick: 1, audioTimeMs: 200 },
        { scoreTick: 2, audioTimeMs: 100 },
      ],
      [
        { scoreTick: -1, audioTimeMs: 0 },
        { scoreTick: 2, audioTimeMs: 100 },
      ],
      [
        { scoreTick: NaN, audioTimeMs: 0 },
        { scoreTick: 2, audioTimeMs: 100 },
      ],
    ])
      expect(() => validateAnchors(input)).toThrow();
  });
  it('짧은 반복과 음원 밖 범위를 거부한다', () => {
    expect(() => validateLoop(0, 249, 1000)).toThrow();
    expect(() => validateLoop(0, 2000, 1000)).toThrow();
    expect(() => validateLoop(0, 500, 1000)).not.toThrow();
  });
});
