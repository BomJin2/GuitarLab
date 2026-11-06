import { describe, it, expect } from 'vitest';
import type { SyncAnchor } from '../../entities/score';
import {
  audioTimeToScoreTick,
  scoreTickToAudioTime,
  scoreTicksToAudioTimes,
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

it('여러 tick 변환은 한 번씩 변환한 값과 같다(앵커 경계·범위 밖 포함)', () => {
  let seed = 7;
  const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let round = 0; round < 50; round++) {
    const anchors: SyncAnchor[] = [];
    let tick = Math.floor(random() * 500);
    let time = random() * 1000;
    for (let i = 0; i < 2 + Math.floor(random() * 30); i++) {
      anchors.push({ scoreTick: tick, audioTimeMs: time });
      tick += 1 + Math.floor(random() * 2000);
      time += 1 + random() * 3000;
    }
    const ticks = [
      ...anchors.map((a) => a.scoreTick),
      ...Array.from({ length: 40 }, () => Math.floor(random() * (tick + 4000))),
    ];
    expect(scoreTicksToAudioTimes(anchors, ticks)).toEqual(
      ticks.map((t) => scoreTickToAudioTime(anchors, t)),
    );
  }
  expect(() =>
    scoreTicksToAudioTimes(
      [
        { scoreTick: 0, audioTimeMs: 0 },
        { scoreTick: 0, audioTimeMs: 1 },
      ],
      [0],
    ),
  ).toThrow();
});
