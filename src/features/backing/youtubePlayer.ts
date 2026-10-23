import { invoke, isTauri } from '@tauri-apps/api/core';
import { isRecord } from '../../shared/validation';
import { isUuid } from '../library/projects';
import { isYoutubeVideoId } from './youtube';

export type YoutubeSession = {
  schemaVersion: 1;
  sessionId: string;
  videoId: string;
  frameUrl: string;
};
export type YoutubeSnapshot = {
  schemaVersion: 2;
  type: 'YOUTUBE_SNAPSHOT';
  sessionId: string;
  videoId: string | null;
  sequence: number;
  ready: boolean;
  state: number | null;
  currentTimeMs: number | null;
  durationMs: number | null;
  playbackRate: number | null;
  errorCode: number | 'SCRIPT_FAILED' | 'API_FAILED' | null;
};
export function decodeYoutubeSession(
  value: unknown,
  videoId: string,
): YoutubeSession {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    value.schemaVersion !== 1 ||
    !isUuid(value.sessionId) ||
    !isYoutubeVideoId(videoId) ||
    value.videoId !== videoId ||
    typeof value.frameUrl !== 'string'
  )
    throw new Error('YOUTUBE_CONTRACT_INVALID');
  const url = new URL(value.frameUrl);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `/${value.sessionId}/player.html` ||
    url.href !== value.frameUrl
  )
    throw new Error('YOUTUBE_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    sessionId: value.sessionId,
    videoId,
    frameUrl: value.frameUrl,
  };
}
function bounded(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
export function decodeYoutubeSnapshot(
  value: unknown,
  session: YoutubeSession,
): YoutubeSnapshot | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 11 ||
    value.schemaVersion !== 2 ||
    value.type !== 'YOUTUBE_SNAPSHOT' ||
    value.sessionId !== session.sessionId ||
    (value.videoId !== null && !isYoutubeVideoId(value.videoId)) ||
    !bounded(value.sequence, 1, Number.MAX_SAFE_INTEGER) ||
    !Number.isSafeInteger(value.sequence) ||
    typeof value.ready !== 'boolean'
  )
    return null;
  const error = value.errorCode;
  if (
    error !== null &&
    error !== 'SCRIPT_FAILED' &&
    error !== 'API_FAILED' &&
    !(bounded(error, 1, 9999) && Number.isInteger(error))
  )
    return null;
  if (!value.ready || error !== null) {
    if (
      value.ready ||
      value.state !== null ||
      value.currentTimeMs !== null ||
      value.durationMs !== null ||
      value.playbackRate !== null
    )
      return null;
    return {
      schemaVersion: 2,
      type: 'YOUTUBE_SNAPSHOT',
      sessionId: session.sessionId,
      videoId: value.videoId,
      sequence: value.sequence,
      ready: false,
      state: null,
      currentTimeMs: null,
      durationMs: null,
      playbackRate: null,
      errorCode: error,
    };
  }
  if (
    typeof value.state !== 'number' ||
    ![-1, 0, 1, 2, 3, 5].includes(value.state) ||
    !bounded(value.currentTimeMs, 0, 604800000) ||
    !bounded(value.durationMs, 0, 604800000) ||
    !bounded(value.playbackRate, 0.1, 4)
  )
    return null;
  return {
    schemaVersion: 2,
    type: 'YOUTUBE_SNAPSHOT',
    sessionId: session.sessionId,
    videoId: value.videoId,
    sequence: value.sequence,
    ready: true,
    state: value.state,
    currentTimeMs: value.currentTimeMs,
    durationMs: value.durationMs,
    playbackRate: value.playbackRate,
    errorCode: null,
  };
}
export function receiveYoutubeSnapshot(
  event: MessageEvent<unknown>,
  source: Window | null,
  session: YoutubeSession,
  previousSequence: number,
) {
  if (
    !source ||
    event.source !== source ||
    event.origin !== new URL(session.frameUrl).origin
  )
    return null;
  const value = decodeYoutubeSnapshot(event.data, session);
  return value && value.sequence > previousSequence ? value : null;
}
export function isYoutubePauseAcknowledgement(
  event: MessageEvent<unknown>,
  source: Window | null,
  session: YoutubeSession,
  requestId: number,
) {
  const value = event.data;
  return (
    !!source &&
    event.source === source &&
    event.origin === new URL(session.frameUrl).origin &&
    isRecord(value) &&
    Object.keys(value).length === 5 &&
    value.schemaVersion === 1 &&
    value.type === 'YOUTUBE_PAUSED' &&
    value.sessionId === session.sessionId &&
    value.videoId === session.videoId &&
    value.requestId === requestId
  );
}
export function youtubeStateLabel(state: number | null) {
  switch (state) {
    case -1:
      return '시작 전';
    case 0:
      return '종료';
    case 1:
      return '재생 중';
    case 2:
      return '일시정지';
    case 3:
      return '버퍼링';
    case 5:
      return '영상 준비됨';
    default:
      return '연결 대기';
  }
}
export const youtubePlayerApi = {
  available: isTauri,
  async open(videoId: string) {
    if (!isYoutubeVideoId(videoId)) throw new Error('YOUTUBE_CONTRACT_INVALID');
    return decodeYoutubeSession(
      await invoke<unknown>('open_youtube_player', {
        request: { schemaVersion: 1, videoId },
      }),
      videoId,
    );
  },
  async close(sessionId: string) {
    if (!isUuid(sessionId)) throw new Error('YOUTUBE_CONTRACT_INVALID');
    const result = await invoke<unknown>('close_youtube_player', {
      request: { schemaVersion: 1, sessionId },
    });
    if (
      !isRecord(result) ||
      Object.keys(result).length !== 2 ||
      result.schemaVersion !== 1 ||
      result.sessionId !== sessionId
    )
      throw new Error('YOUTUBE_CONTRACT_INVALID');
  },
};
