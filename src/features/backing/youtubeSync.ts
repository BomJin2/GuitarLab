import type { SyncAnchor } from '../../entities/score';
import { audioTimeToScoreTick, validateAnchors } from '../player/sync';
import { isYoutubeVideoId } from './youtube';
import type { YoutubeSnapshot } from './youtubePlayer';
import type { YoutubeSyncProfile } from './projectYoutubeSync';

export type YoutubeSyncContext = {
  scoreId: string;
  trackId: string;
  videoId: string;
  endTick: number;
};
export type YoutubeManualSync = {
  context: YoutubeSyncContext;
  anchors: SyncAnchor[];
};
export type YoutubeSyncDraft = { bar: string; seconds: string };

export function restoreYoutubeManualSync(
  context: YoutubeSyncContext,
  barStarts: number[],
  stored: YoutubeSyncProfile,
  durationMs: number,
): { draft: YoutubeSyncDraft[]; profile: YoutubeManualSync } {
  if (
    stored.scoreId !== context.scoreId ||
    stored.endTick !== context.endTick ||
    Math.abs(stored.durationMs - durationMs) > 1000
  )
    throw new Error(
      '저장 맞춤과 현재 악보·영상 길이가 다릅니다. 다시 맞춰주세요.',
    );
  const positions = [...barStarts, context.endTick];
  const draft = stored.anchors.map((anchor) => ({
    bar: String(positions.indexOf(anchor.scoreTick) + 1),
    seconds: String(anchor.audioTimeMs / 1000),
  }));
  return {
    draft,
    profile: createYoutubeManualSync(context, barStarts, draft, durationMs),
  };
}

export function createYoutubeManualSync(
  context: YoutubeSyncContext,
  barStarts: number[],
  draft: YoutubeSyncDraft[],
  durationMs: number,
): YoutubeManualSync {
  if (
    !isYoutubeVideoId(context.videoId) ||
    !context.scoreId ||
    !context.trackId ||
    !Number.isSafeInteger(context.endTick) ||
    context.endTick <= 0 ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > 604800000 ||
    draft.length !== 2 ||
    !barStarts.length ||
    barStarts.some(
      (tick, index) =>
        !Number.isSafeInteger(tick) ||
        tick < 0 ||
        tick >= context.endTick ||
        (index > 0 && tick <= (barStarts[index - 1] ?? -1)),
    )
  )
    throw new Error('악보와 영상 길이를 확인해주세요.');
  const positions = [...barStarts, context.endTick];
  const anchors = draft.map(({ bar, seconds }) => {
    if (
      !bar.trim() ||
      !seconds.trim() ||
      bar.length > 32 ||
      seconds.length > 32
    )
      throw new Error('두 맞춤 지점의 마디 번호와 영상 초를 입력해주세요.');
    const index = Number(bar) - 1;
    const audioTimeMs = Number(seconds) * 1000;
    const scoreTick = Number.isInteger(index) ? positions[index] : undefined;
    if (
      scoreTick === undefined ||
      !Number.isFinite(audioTimeMs) ||
      audioTimeMs < 0 ||
      audioTimeMs > durationMs
    )
      throw new Error('마디 번호와 영상 초는 악보·영상 범위 안이어야 합니다.');
    return { scoreTick, audioTimeMs };
  });
  try {
    validateAnchors(anchors);
  } catch {
    throw new Error(
      '두 번째 지점의 마디 번호와 영상 시간은 첫 번째보다 커야 합니다.',
    );
  }
  return { context: { ...context }, anchors };
}

export function youtubeSyncCursor(
  profile: YoutubeManualSync | null,
  context: YoutubeSyncContext,
  snapshot: YoutubeSnapshot | null,
  unavailable: boolean,
): {
  tick: number | null;
  status: 'UNCONFIGURED' | 'WAITING' | 'OUTSIDE' | 'READY';
} {
  if (!profile) return { tick: null, status: 'UNCONFIGURED' };
  if (
    unavailable ||
    !snapshot?.ready ||
    snapshot.errorCode !== null ||
    ![0, 1, 2].includes(snapshot.state ?? -1) ||
    snapshot.videoId !== context.videoId ||
    profile.context.scoreId !== context.scoreId ||
    profile.context.trackId !== context.trackId ||
    profile.context.videoId !== context.videoId ||
    profile.context.endTick !== context.endTick
  )
    return { tick: null, status: 'WAITING' };
  const time = snapshot.currentTimeMs;
  const start = profile.anchors[0];
  const end = profile.anchors[1];
  if (
    time === null ||
    !Number.isFinite(time) ||
    !start ||
    !end ||
    time < start.audioTimeMs ||
    time > end.audioTimeMs
  )
    return { tick: null, status: 'OUTSIDE' };
  return { tick: audioTimeToScoreTick(profile.anchors, time), status: 'READY' };
}
