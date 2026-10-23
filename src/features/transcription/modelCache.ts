import { isTauri } from '@tauri-apps/api/core';
import { isRecord } from '../../shared/validation';
import { runStorageJob } from '../library/projects';
import { modelPlans, type AiModelId } from './modelInstallation';

export type ModelCacheInfo = {
  schemaVersion: 1;
  modelId: AiModelId;
  modelVersion: string;
  state: 'CACHE_VERIFIED';
  artifactCount: number;
  totalBytes: number;
  reusedFiles: number;
};
const cacheProfiles: Record<AiModelId, readonly (readonly [number, number])[]> =
  {
    'basic-pitch': [
      [41, 144366287],
      [42, 146364006],
    ],
    htdemucs_6s: [
      [33, 707117623],
      [34, 708033316],
    ],
  };
export function decodeModelCache(
  value: unknown,
  modelId: AiModelId = 'basic-pitch',
): ModelCacheInfo {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 7 ||
    value.schemaVersion !== 1 ||
    value.modelId !== modelId ||
    value.modelVersion !== modelPlans[modelId].version ||
    value.state !== 'CACHE_VERIFIED' ||
    typeof value.artifactCount !== 'number' ||
    typeof value.totalBytes !== 'number' ||
    !cacheProfiles[modelId].some(
      ([count, bytes]) =>
        value.artifactCount === count && value.totalBytes === bytes,
    ) ||
    typeof value.reusedFiles !== 'number' ||
    !Number.isInteger(value.reusedFiles) ||
    value.reusedFiles < 0 ||
    value.reusedFiles > value.artifactCount
  )
    throw new Error('AI_PROTOCOL_INVALID');
  return {
    schemaVersion: 1,
    modelId,
    modelVersion: modelPlans[modelId].version,
    state: 'CACHE_VERIFIED',
    artifactCount: value.artifactCount,
    totalBytes: value.totalBytes,
    reusedFiles: value.reusedFiles,
  };
}
export const modelCacheApi = {
  available: isTauri,
  async download(
    consent: boolean,
    signal: AbortSignal,
    progress: (percent: number) => void,
    modelId: AiModelId = 'basic-pitch',
  ) {
    if (!consent) throw new Error('AI_DOWNLOAD_CONSENT_REQUIRED');
    return decodeModelCache(
      await runStorageJob(
        'download_ai_model',
        { modelId, downloadConsent: true },
        signal,
        (job) => progress(job.totalBytes === 100 ? job.completedBytes : 0),
        { waitForCancellation: true },
      ),
      modelId,
    );
  },
};
