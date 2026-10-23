import { expect, it } from 'vitest';
import {
  createYoutubeManualSync,
  restoreYoutubeManualSync,
  youtubeSyncCursor,
} from './youtubeSync';
import type { YoutubeSnapshot } from './youtubePlayer';
const context = {
  scoreId: 'score',
  trackId: 'guitar',
  videoId: 'Ab_cD-12345',
  endTick: 7680,
};
const points = [
  { bar: '1', seconds: '2' },
  { bar: '3', seconds: '6' },
];
const sample: YoutubeSnapshot = {
  schemaVersion: 2,
  type: 'YOUTUBE_SNAPSHOT',
  sessionId: 'session',
  videoId: context.videoId,
  sequence: 1,
  ready: true,
  state: 1,
  currentTimeMs: 4000,
  durationMs: 10000,
  playbackRate: 1,
  errorCode: null,
};
const create = () => createYoutubeManualSync(context, [0, 3840], points, 10000);
it('저장 지점은 현재 진행 마디·악보 끝·영상 길이에 다시 검증해 복원한다', () => {
  const stored = {
    scoreId: context.scoreId,
    endTick: context.endTick,
    durationMs: 10000,
    anchors: create().anchors,
  };
  expect(restoreYoutubeManualSync(context, [0, 3840], stored, 10000)).toEqual({
    draft: points,
    profile: create(),
  });
  for (const changed of [
    { ...stored, scoreId: 'other' },
    { ...stored, endTick: 9999 },
    { ...stored, durationMs: 12000 },
    {
      ...stored,
      anchors: [{ scoreTick: 1, audioTimeMs: 2000 }, stored.anchors[1]!],
    },
  ])
    expect(() =>
      restoreYoutubeManualSync(context, [0, 3840], changed, 10000),
    ).toThrow();
});
it('두 사용자 지점 사이의 현재 시간만 보간하고 seek·배속에서 시간을 재계산하지 않는다', () => {
  const profile = create();
  expect(youtubeSyncCursor(profile, context, sample, false)).toEqual({
    tick: 3840,
    status: 'READY',
  });
  for (const rate of [0.5, 0.75, 1, 1.5])
    expect(
      youtubeSyncCursor(
        profile,
        context,
        { ...sample, playbackRate: rate },
        false,
      ).tick,
    ).toBe(3840);
  expect(
    youtubeSyncCursor(
      profile,
      context,
      { ...sample, currentTimeMs: 2000, state: 2 },
      false,
    ).tick,
  ).toBe(0);
  expect(
    youtubeSyncCursor(
      profile,
      context,
      { ...sample, currentTimeMs: 6000, state: 0 },
      false,
    ).tick,
  ).toBe(7680);
  expect(
    youtubeSyncCursor(
      profile,
      context,
      { ...sample, currentTimeMs: 3000 },
      false,
    ).tick,
  ).toBe(1920);
  expect(points).toEqual([
    { bar: '1', seconds: '2' },
    { bar: '3', seconds: '6' },
  ]);
});
it('빈 값·범위 밖·중복/역전·비유한 값과 잘못된 마디 lookup을 거부한다', () => {
  for (const draft of [
    [],
    [{ bar: '1', seconds: '' }, points[1]!],
    [points[0]!, { bar: '1', seconds: '6' }],
    [points[0]!, { bar: '3', seconds: '1' }],
    [points[0]!, { bar: '4', seconds: '6' }],
    [points[0]!, { bar: '2.5', seconds: '6' }],
    [points[0]!, { bar: '3', seconds: '11' }],
    [{ bar: '1', seconds: '-1' }, points[1]!],
    [{ bar: '1', seconds: 'NaN' }, points[1]!],
    [{ bar: '1', seconds: 'Infinity' }, points[1]!],
  ])
    expect(() =>
      createYoutubeManualSync(context, [0, 3840], draft, 10000),
    ).toThrow();
  for (const starts of [[], [3840, 0], [0, 0], [-1, 3840], [0, 7680]])
    expect(() =>
      createYoutubeManualSync(context, starts, points, 10000),
    ).toThrow();
});
it('관측 미준비·버퍼링·다른 소스/악보/트랙·앵커 구간 밖에서는 커서를 숨긴다', () => {
  const profile = create();
  for (const change of [
    { state: 3 },
    { state: -1 },
    { ready: false },
    { videoId: 'other' },
    { videoId: null },
    { videoId: 'Zy_xW-98765' },
    { currentTimeMs: null },
    { currentTimeMs: 1999 },
    { currentTimeMs: 6001 },
  ])
    expect(
      youtubeSyncCursor(profile, context, { ...sample, ...change }, false).tick,
    ).toBeNull();
  expect(youtubeSyncCursor(profile, context, sample, true).tick).toBeNull();
  for (const change of [
    { scoreId: 'other' },
    { trackId: 'other' },
    { videoId: 'other' },
    { endTick: 9999 },
  ])
    expect(
      youtubeSyncCursor(profile, { ...context, ...change }, sample, false).tick,
    ).toBeNull();
  expect(youtubeSyncCursor(null, context, sample, false).status).toBe(
    'UNCONFIGURED',
  );
});
it('반복을 펼친 진행 마디 번호를 독립된 tick으로 해석한다', () => {
  const repeated = { ...context, endTick: 11520 };
  const profile = createYoutubeManualSync(
    repeated,
    [0, 3840, 7680],
    [
      { bar: '2', seconds: '1' },
      { bar: '4', seconds: '5' },
    ],
    10000,
  );
  expect(profile.anchors.map((p) => p.scoreTick)).toEqual([3840, 11520]);
  expect(
    youtubeSyncCursor(
      profile,
      repeated,
      { ...sample, currentTimeMs: 3000 },
      false,
    ).tick,
  ).toBe(7680);
});
