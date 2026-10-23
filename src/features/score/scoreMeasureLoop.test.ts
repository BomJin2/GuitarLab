import { importer } from '@coderline/alphatab';
import { expect, it } from 'vitest';
import xml from '../../../public/fixtures/standard.musicxml?raw';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
} from './alphaTabAdapter';
import { scoreMeasureLoop } from './scoreMeasureLoop';

const score = importScore(new TextEncoder().encode(xml));
const lookup = buildPlaybackLookup(score);
const document = normalizeScore(score, lookup);

it('마디 전체의 tick을 인트로·비선형 싱크로 변환하고 음표/앵커를 보존한다', () => {
  const anchors = [
    { scoreTick: 0, audioTimeMs: 600 },
    { scoreTick: 3840, audioTimeMs: 3000 },
    { scoreTick: 7680, audioTimeMs: 4500 },
  ];
  const before = JSON.stringify({ anchors, document });
  expect(scoreMeasureLoop(lookup, anchors, 0, 0, 5000)).toEqual({
    startMs: 600,
    endMs: 3000,
  });
  expect(scoreMeasureLoop(lookup, anchors, 1, 1, 5000)).toEqual({
    startMs: 3000,
    endMs: 4500,
  });
  expect(scoreMeasureLoop(lookup, anchors, 0, 1, 5000)).toEqual({
    startMs: 600,
    endMs: 4500,
  });
  expect(JSON.stringify({ anchors, document })).toBe(before);
});

it('쉼표뿐인 마디와 같은 표기의 두 번째 반복을 실제 occurrence로 구분한다', () => {
  const repeated = importer.ScoreLoader.loadAlphaTex('. r.1 | 0.1.1');
  repeated.masterBars[0]!.isRepeatStart = true;
  repeated.masterBars[1]!.repeatCount = 2;
  repeated.rebuildRepeatGroups();
  const playback = buildPlaybackLookup(repeated);
  expect(playback.masterBars.map((bar) => bar.masterBar.index)).toEqual([
    0, 1, 0, 1,
  ]);
  const anchors = normalizeScore(repeated, playback).syncAnchors;
  expect(scoreMeasureLoop(playback, anchors, 0, 0, 8000)).toEqual({
    startMs: 0,
    endMs: 2000,
  });
  expect(scoreMeasureLoop(playback, anchors, 2, 3, 8000)).toEqual({
    startMs: 4000,
    endMs: 8000,
  });
});

it('없는/역전/소수 선택과 손상 앵커·음원 밖/너무 짧은 구간을 거부한다', () => {
  for (const [first, last] of [
    [-1, 0],
    [1, 0],
    [0, 2],
    [0.5, 1],
    [NaN, 1],
  ])
    expect(() =>
      scoreMeasureLoop(lookup, document.syncAnchors, first!, last!, 4000),
    ).toThrow();
  expect(() =>
    scoreMeasureLoop(lookup, document.syncAnchors, 1, 1, 3999),
  ).toThrow();
  expect(() =>
    scoreMeasureLoop(lookup, document.syncAnchors, 0, 0, NaN),
  ).toThrow();
  expect(() =>
    scoreMeasureLoop(lookup, [{ scoreTick: 0, audioTimeMs: 0 }], 0, 0, 4000),
  ).toThrow();
  expect(() =>
    scoreMeasureLoop(
      lookup,
      [
        { scoreTick: 0, audioTimeMs: 0 },
        { scoreTick: 7680, audioTimeMs: 400 },
      ],
      0,
      0,
      4000,
    ),
  ).toThrow();
  expect(() =>
    scoreMeasureLoop(
      lookup,
      [
        { scoreTick: 0, audioTimeMs: 0 },
        { scoreTick: 7680, audioTimeMs: 4000 },
      ],
      0,
      0,
      0,
    ),
  ).toThrow();
});
