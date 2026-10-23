import { isTauri } from '@tauri-apps/api/core';
import { isRecord } from '../../shared/validation';
import { isUuid, runStorageJob, type JobSnapshot } from '../library/projects';
import { isYoutubeVideoId, type YoutubeSelection } from './youtube';

export type ProjectBacking = {
  schemaVersion: 1;
  projectId: string;
  selection: YoutubeSelection | null;
};
export function decodeProjectBacking(
  value: unknown,
  projectId: string,
): ProjectBacking {
  if (
    !isUuid(projectId) ||
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    value.schemaVersion !== 1 ||
    value.projectId !== projectId
  )
    throw new Error('BACKING_CONTRACT_INVALID');
  if (value.selection === null)
    return { schemaVersion: 1, projectId, selection: null };
  const selection = value.selection;
  if (
    !isRecord(selection) ||
    Object.keys(selection).length !== 3 ||
    selection.kind !== 'YOUTUBE_EMBED' ||
    selection.selectedByUser !== true ||
    !isYoutubeVideoId(selection.videoId)
  )
    throw new Error('BACKING_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    projectId,
    selection: {
      kind: 'YOUTUBE_EMBED',
      videoId: selection.videoId,
      selectedByUser: true,
    },
  };
}
export const projectBackingApi = {
  available: isTauri,
  async load(
    projectId: string,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    if (!isUuid(projectId)) throw new Error('BACKING_CONTRACT_INVALID');
    const result = await runStorageJob(
      'get_project_backing',
      { projectId },
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (signal.aborted) throw new DOMException('주소 조회 취소', 'AbortError');
    return decodeProjectBacking(result, projectId);
  },
  async save(
    value: ProjectBacking,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    const request = decodeProjectBacking(value, value.projectId);
    const result = await runStorageJob(
      'save_backing_selection',
      request,
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (signal.aborted) throw new DOMException('주소 저장 취소', 'AbortError');
    const saved = decodeProjectBacking(result, value.projectId);
    if (JSON.stringify(saved) !== JSON.stringify(request))
      throw new Error('BACKING_CONTRACT_INVALID');
    return saved;
  },
};
export function backingStorageError(cause: unknown): string {
  const code =
    isRecord(cause) && typeof cause.code === 'string'
      ? cause.code
      : cause instanceof Error
        ? cause.message
        : '';
  switch (code) {
    case 'YT_URL_INVALID':
      return '저장할 YouTube 동영상 주소를 확인해주세요.';
    case 'STORAGE_BUSY':
      return '다른 파일 작업을 마치거나 취소한 뒤 다시 시도하세요.';
    case 'RECORDING_BUSY':
      return '녹음 STOP과 저장을 마친 뒤 주소를 저장하세요.';
    case 'PROJECT_NOT_FOUND':
      return '프로젝트를 다시 열어주세요.';
    case 'INVALID_BACKING_SOURCE':
    case 'BACKING_CONTRACT_INVALID':
      return '저장 주소 응답이 올바르지 않습니다. 기존 악보·녹음은 유지됩니다.';
    default:
      return '주소를 읽거나 저장하지 못했습니다. 다시 읽어 저장 상태를 확인하세요.';
  }
}
