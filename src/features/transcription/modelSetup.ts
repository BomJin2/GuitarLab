import { isTauri } from '@tauri-apps/api/core';
import { isRecord } from '../../shared/validation';
import { isUuid, runStorageJob } from '../library/projects';
import { modelPlans, type AiModelId } from './modelInstallation';

export type ModelSetupResult = {
  schemaVersion: 1;
  modelId: AiModelId;
  modelVersion: string;
  environmentId: string;
  state: 'INSTALLED' | 'ALREADY_ACTIVE';
  selfTest: 'OWNED_8_NOTES_PASSED' | 'OWNED_STEM_SPLIT_PASSED';
};
export const setupStages = [
  '설치 파일·환경 확인',
  '오프라인 패키지 설치',
  '의존성 검사',
  '자체 음원 분석 검증',
  '검증 환경 활성화',
  '완료',
];
export function decodeModelSetup(
  value: unknown,
  modelId: AiModelId = 'basic-pitch',
): ModelSetupResult {
  const selfTest =
    modelId === 'basic-pitch'
      ? 'OWNED_8_NOTES_PASSED'
      : 'OWNED_STEM_SPLIT_PASSED';
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    value.schemaVersion !== 1 ||
    value.modelId !== modelId ||
    value.modelVersion !== modelPlans[modelId].version ||
    !isUuid(value.environmentId) ||
    (value.state !== 'INSTALLED' && value.state !== 'ALREADY_ACTIVE') ||
    value.selfTest !== selfTest
  )
    throw new Error('AI_PROTOCOL_INVALID');
  return {
    schemaVersion: 1,
    modelId,
    modelVersion: modelPlans[modelId].version,
    environmentId: value.environmentId,
    state: value.state,
    selfTest,
  };
}
export const modelSetupApi = {
  available: isTauri,
  async install(
    signal: AbortSignal,
    progress: (stage: string) => void,
    modelId: AiModelId = 'basic-pitch',
  ) {
    return decodeModelSetup(
      await runStorageJob(
        'install_ai_model',
        { modelId },
        signal,
        (job) => {
          if (
            job.totalBytes === 5 &&
            Number.isInteger(job.completedBytes) &&
            job.completedBytes >= 0 &&
            job.completedBytes <= 5
          )
            progress(setupStages[job.completedBytes] ?? '설치 준비');
        },
        { waitForCancellation: true },
      ),
      modelId,
    );
  },
};
