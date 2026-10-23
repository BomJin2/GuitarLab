import { expect, it } from 'vitest';
import {
  decodeYoutubeSession,
  decodeYoutubeSnapshot,
  receiveYoutubeSnapshot,
} from './youtubePlayer';
const id = '00000000-0000-4000-8000-000000000001';
const session = {
  schemaVersion: 1,
  sessionId: id,
  videoId: 'Ab_cD-12345',
  frameUrl: `http://127.0.0.1:43210/${id}/player.html`,
} as const;
const snapshot = {
  schemaVersion: 2,
  type: 'YOUTUBE_SNAPSHOT',
  sessionId: id,
  videoId: session.videoId,
  sequence: 1,
  ready: true,
  state: 1,
  currentTimeMs: 1234.5,
  durationMs: 9000,
  playbackRate: 1,
  errorCode: null,
};
it('세션은 정확한 loopback origin/UUID 경로만 허용한다', () => {
  expect(decodeYoutubeSession(session, session.videoId)).toEqual(session);
  for (const value of [
    { ...session, schemaVersion: 2 },
    { ...session, secret: true },
    { ...session, sessionId: '../escape' },
    { ...session, videoId: 'wrong' },
    ...[
      'https://127.0.0.1:43210',
      'http://localhost:43210',
      'http://127.0.0.1:43210@evil.invalid',
      'http://127.0.0.1',
    ].map((origin) => ({
      ...session,
      frameUrl: `${origin}/${id}/player.html`,
    })),
    { ...session, frameUrl: session.frameUrl + '?url=secret' },
    { ...session, frameUrl: session.frameUrl + '#secret' },
  ])
    expect(() => decodeYoutubeSession(value, session.videoId)).toThrow();
});
it('상태/오류/시간 계약에서 누락·과대·비유한·알 수 없는 필드를 거부한다', () => {
  expect(decodeYoutubeSnapshot(snapshot, session)?.currentTimeMs).toBe(1234.5);
  expect(
    decodeYoutubeSnapshot({ ...snapshot, videoId: null }, session)?.videoId,
  ).toBeNull();
  expect(
    decodeYoutubeSnapshot({ ...snapshot, videoId: 'Zy_xW-98765' }, session)
      ?.videoId,
  ).toBe('Zy_xW-98765');
  for (const change of [
    { schemaVersion: 1 },
    { schemaVersion: 3 },
    { sequence: 0 },
    { sequence: 1.1 },
    { sequence: Infinity },
    { state: 4 },
    { currentTimeMs: NaN },
    { currentTimeMs: -1 },
    { durationMs: 604800001 },
    { playbackRate: 0 },
    { ready: 'true' },
    { ready: false },
    { errorCode: 153 },
    { unknown: 1 },
    { sessionId: 'stale' },
    { videoId: 'other' },
  ])
    expect(
      decodeYoutubeSnapshot({ ...snapshot, ...change }, session),
    ).toBeNull();
  const failed = {
    ...snapshot,
    ready: false,
    state: null,
    currentTimeMs: null,
    durationMs: null,
    playbackRate: null,
    errorCode: 153,
  };
  expect(decodeYoutubeSnapshot(failed, session)?.errorCode).toBe(153);
  expect(
    decodeYoutubeSnapshot({ ...failed, errorCode: 'SCRIPT_FAILED' }, session),
  ).toBeTruthy();
  expect(
    decodeYoutubeSnapshot({ ...failed, errorCode: 'unknown' }, session),
  ).toBeNull();
});
it('메시지는 소유 frame의 정확한 origin·source와 증가 sequence만 받는다', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const source = iframe.contentWindow;
  const event = (origin: string, sender: MessageEventSource | null = source) =>
    new MessageEvent('message', { data: snapshot, origin, source: sender });
  expect(
    receiveYoutubeSnapshot(event('http://127.0.0.1:43210'), source, session, 0),
  ).toBeTruthy();
  expect(
    receiveYoutubeSnapshot(event('http://127.0.0.1:43211'), source, session, 0),
  ).toBeNull();
  expect(
    receiveYoutubeSnapshot(
      event('http://127.0.0.1:43210', window),
      source,
      session,
      0,
    ),
  ).toBeNull();
  expect(
    receiveYoutubeSnapshot(event('http://127.0.0.1:43210'), source, session, 1),
  ).toBeNull();
  iframe.remove();
});
