import { invoke, isTauri } from '@tauri-apps/api/core';
import { isRecord, isSafeUnsigned } from '../../shared/validation';
import { runStorageJob } from '../library/projects';
import { modelPlans, type AiModelId } from './modelInstallation';

type CacheSummary = {
  schemaVersion: 1;
  modelId: AiModelId;
  modelVersion: string;
  profile: 'CP312_DOWNLOADS';
};
export type CacheUsage = CacheSummary & {
  state: 'CACHE_USAGE';
  files: number;
  bytes: number;
  revision: string;
};
export type CacheCleared = CacheSummary & {
  state: 'CACHE_CLEARED';
  removedFiles: number;
  removedBytes: number;
  installedEnvironmentsChanged: false;
};
function common(
  value: unknown,
  modelId: AiModelId,
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === 8 &&
    value.schemaVersion === 1 &&
    value.modelId === modelId &&
    value.modelVersion === modelPlans[modelId].version &&
    value.profile === 'CP312_DOWNLOADS'
  );
}
function fileCount(value: unknown, modelId: AiModelId): value is number {
  return isSafeUnsigned(value, modelId === 'basic-pitch' ? 42 : 34);
}
export function decodeCacheUsage(
  value: unknown,
  modelId: AiModelId,
): CacheUsage {
  if (
    !common(value, modelId) ||
    value.state !== 'CACHE_USAGE' ||
    !fileCount(value.files, modelId) ||
    !isSafeUnsigned(value.bytes, 2 * 1024 ** 3) ||
    (value.files === 0 && value.bytes !== 0) ||
    typeof value.revision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.revision)
  )
    throw new Error('AI_CACHE_PROTOCOL_INVALID');
  return {
    schemaVersion: 1,
    modelId,
    modelVersion: modelPlans[modelId].version,
    profile: 'CP312_DOWNLOADS',
    state: 'CACHE_USAGE',
    files: value.files,
    bytes: value.bytes,
    revision: value.revision,
  };
}
export function decodeCacheCleared(
  value: unknown,
  modelId: AiModelId,
): CacheCleared {
  if (
    !common(value, modelId) ||
    value.state !== 'CACHE_CLEARED' ||
    !fileCount(value.removedFiles, modelId) ||
    !isSafeUnsigned(value.removedBytes, 2 * 1024 ** 3) ||
    (value.removedFiles === 0 && value.removedBytes !== 0) ||
    value.installedEnvironmentsChanged !== false
  )
    throw new Error('AI_CACHE_PROTOCOL_INVALID');
  return {
    schemaVersion: 1,
    modelId,
    modelVersion: modelPlans[modelId].version,
    profile: 'CP312_DOWNLOADS',
    state: 'CACHE_CLEARED',
    removedFiles: value.removedFiles,
    removedBytes: value.removedBytes,
    installedEnvironmentsChanged: false,
  };
}
export const cacheCleanupApi = {
  available: isTauri,
  async inspect(modelId: AiModelId) {
    return decodeCacheUsage(
      await invoke<unknown>('inspect_model_download_cache', {
        request: { schemaVersion: 1, modelId },
      }),
      modelId,
    );
  },
  async clear(
    usage: CacheUsage,
    signal: AbortSignal,
    progress: (percent: number) => void,
  ) {
    return decodeCacheCleared(
      await runStorageJob(
        'clear_model_download_cache',
        {
          modelId: usage.modelId,
          clearConsent: true,
          expectedRevision: usage.revision,
        },
        signal,
        (job) => progress(job.totalBytes === 100 ? job.completedBytes : 0),
        { waitForCancellation: true },
      ),
      usage.modelId,
    );
  },
};
export function cacheCleanupError(cause: unknown, removing = false) {
  const code = cause instanceof Error ? cause.message : '';
  const messages: Record<string, string> = {
    AI_CACHE_CHANGED:
      '조회 이후 캐시가 바뀌었습니다. 다시 조회하고 확인해주세요.',
    AI_CACHE_UNEXPECTED_FILE:
      '캐시에 예상하지 않은 파일·폴더가 있어 자동 정리하지 않습니다.',
    AI_CACHE_PATH_INVALID:
      '캐시 경로의 링크나 상태를 확인하지 못해 정리하지 않습니다.',
    RECORDING_BUSY: '녹음 STOP과 저장을 마친 뒤 캐시를 정리해주세요.',
    STORAGE_BUSY: '다른 파일·모델 작업이 끝난 뒤 다시 시도해주세요.',
  };
  const message =
    messages[code] ??
    (removing
      ? '캐시를 정리하지 못했습니다.'
      : '캐시 현황을 확인하지 못했습니다.');
  return removing &&
    !['RECORDING_BUSY', 'STORAGE_BUSY', 'AI_CACHE_UNEXPECTED_FILE'].includes(
      code,
    )
    ? `${message} 일부 캐시는 이미 삭제됐을 수 있으니 다시 조회해주세요.`
    : message;
}
