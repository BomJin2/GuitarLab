import { isTauri } from '@tauri-apps/api/core';
import type { SyncAnchor } from '../../entities/score';
import { isRecord } from '../../shared/validation';
import { isUuid, runStorageJob, type JobSnapshot } from '../library/projects';
import { isYoutubeVideoId } from './youtube';

export type YoutubeSyncKey = {
  schemaVersion: 1;
  projectId: string;
  revisionId: string;
  videoId: string;
  trackId: string;
};
export type YoutubeSyncProfile = {
  scoreId: string;
  endTick: number;
  durationMs: number;
  anchors: SyncAnchor[];
};
export type ProjectYoutubeSync = YoutubeSyncKey & {
  profile: YoutubeSyncProfile | null;
};
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !/\p{Cc}/u.test(value)
  );
}
function invalid(): never {
  throw new Error('YOUTUBE_SYNC_CONTRACT_INVALID');
}
function validateKey(key: YoutubeSyncKey) {
  if (
    Object.keys(key).length !== 5 ||
    key.schemaVersion !== 1 ||
    !isUuid(key.projectId) ||
    !isUuid(key.revisionId) ||
    !isYoutubeVideoId(key.videoId) ||
    !identifier(key.trackId)
  )
    invalid();
}
export function decodeProjectYoutubeSync(
  value: unknown,
  key: YoutubeSyncKey,
): ProjectYoutubeSync {
  validateKey(key);
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    Object.entries(key).some(([field, expected]) => value[field] !== expected)
  )
    invalid();
  if (value.profile === null) return { ...key, profile: null };
  const p = value.profile;
  if (
    !isRecord(p) ||
    Object.keys(p).length !== 4 ||
    !identifier(p.scoreId) ||
    typeof p.endTick !== 'number' ||
    !Number.isSafeInteger(p.endTick) ||
    p.endTick <= 0 ||
    typeof p.durationMs !== 'number' ||
    !Number.isFinite(p.durationMs) ||
    p.durationMs <= 0 ||
    p.durationMs > 604800000 ||
    !Array.isArray(p.anchors) ||
    p.anchors.length !== 2
  )
    invalid();
  const { endTick, durationMs } = p;
  const anchors = p.anchors.map((anchor: unknown) => {
    if (
      !isRecord(anchor) ||
      Object.keys(anchor).length !== 2 ||
      typeof anchor.scoreTick !== 'number' ||
      !Number.isSafeInteger(anchor.scoreTick) ||
      anchor.scoreTick < 0 ||
      anchor.scoreTick > endTick ||
      typeof anchor.audioTimeMs !== 'number' ||
      !Number.isFinite(anchor.audioTimeMs) ||
      anchor.audioTimeMs < 0 ||
      anchor.audioTimeMs > durationMs
    )
      invalid();
    return { scoreTick: anchor.scoreTick, audioTimeMs: anchor.audioTimeMs };
  });
  if (
    !anchors[0] ||
    !anchors[1] ||
    anchors[0].scoreTick >= anchors[1].scoreTick ||
    anchors[0].audioTimeMs >= anchors[1].audioTimeMs
  )
    invalid();
  return {
    ...key,
    profile: {
      scoreId: p.scoreId,
      endTick: p.endTick,
      durationMs: p.durationMs,
      anchors,
    },
  };
}
export const projectYoutubeSyncApi = {
  available: isTauri,
  async load(
    key: YoutubeSyncKey,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    validateKey(key);
    const result = await runStorageJob(
      'get_youtube_sync',
      key,
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (signal.aborted)
      throw new DOMException('영상 맞춤 조회 취소', 'AbortError');
    return decodeProjectYoutubeSync(result, key);
  },
  async save(
    value: ProjectYoutubeSync,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    const key: YoutubeSyncKey = {
      schemaVersion: value.schemaVersion,
      projectId: value.projectId,
      revisionId: value.revisionId,
      videoId: value.videoId,
      trackId: value.trackId,
    };
    const request = decodeProjectYoutubeSync(value, key);
    const result = await runStorageJob(
      'save_youtube_sync',
      request,
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (signal.aborted)
      throw new DOMException('영상 맞춤 저장 취소', 'AbortError');
    const saved = decodeProjectYoutubeSync(result, key);
    if (JSON.stringify(saved) !== JSON.stringify(request)) invalid();
    return saved;
  },
};
export function youtubeSyncStorageError(cause: unknown): string {
  const code =
    isRecord(cause) && typeof cause.code === 'string'
      ? cause.code
      : cause instanceof Error
        ? cause.message
        : '';
  switch (code) {
    case 'STORAGE_BUSY':
      return '다른 파일 작업을 마치거나 취소한 뒤 다시 시도하세요.';
    case 'RECORDING_BUSY':
      return '녹음 STOP과 저장 후 영상 맞춤을 저장하세요.';
    case 'YOUTUBE_SYNC_LIMIT':
      return '프로젝트 맞춤100개 한도입니다. 필요 없는 맞춤을 삭제하세요.';
    case 'REVISION_NOT_FOUND':
      return '프로젝트 악보를 저장하고 다시 열어주세요.';
    case 'INVALID_YOUTUBE_SYNC':
    case 'YOUTUBE_SYNC_CONTRACT_INVALID':
      return '저장 맞춤의 악보·영상·지점이 다르거나 손상됐습니다. 다시 맞춰주세요.';
    default:
      return '영상 맞춤을 읽거나 저장하지 못했습니다. 다시 읽어 저장 상태를 확인하세요.';
  }
}
