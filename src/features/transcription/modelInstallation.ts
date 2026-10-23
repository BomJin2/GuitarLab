import { isTauri } from '@tauri-apps/api/core';
import { isRecord } from '../../shared/validation';
import { runStorageJob } from '../library/projects';

export type AiModelId = 'basic-pitch' | 'htdemucs_6s';
export const modelPlans = {
  'basic-pitch': {
    name: 'Basic Pitch',
    version: '0.4.0',
    description: '음표 추출 · 별도 ONNX CPU 환경',
    installation: '다운로드 약138MiB · 설치 여유 공간1GiB 계획',
    license: '코드 Apache-2.0 · 배포 전 의존성 고지 검토 필요',
  },
  htdemucs_6s: {
    name: 'Demucs 전체 기타',
    version: '4.1.0',
    description:
      '전체 기타/잔여 반주 분리 · 별도 Torch CPU 환경 · Lead/Rhythm 미지원',
    installation: '다운로드 약675~676MiB · 설치 여유 공간4GiB 계획',
    license: '가중치 연구용 안내 · 재배포 허가 미확정 · 앱 번들 제외',
  },
} satisfies Record<
  AiModelId,
  {
    name: string;
    version: string;
    description: string;
    installation: string;
    license: string;
  }
>;
export type ModelInstallation = {
  schemaVersion: 1;
  modelId: AiModelId;
  modelVersion: string;
  pythonVersion: string;
  state: 'FILES_VERIFIED';
};
export function decodeModelInstallation(
  value: unknown,
  modelId: AiModelId,
): ModelInstallation {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 5 ||
    value.schemaVersion !== 1 ||
    value.modelId !== modelId ||
    value.modelVersion !== modelPlans[modelId].version ||
    typeof value.pythonVersion !== 'string' ||
    !/^(?:3\.10\.\d{1,3}|3\.12\.15)$/.test(value.pythonVersion) ||
    value.state !== 'FILES_VERIFIED'
  )
    throw new Error('AI_PROTOCOL_INVALID');
  return {
    schemaVersion: 1,
    modelId,
    modelVersion: value.modelVersion,
    pythonVersion: value.pythonVersion,
    state: 'FILES_VERIFIED',
  };
}
export const modelInstallationApi = {
  available: isTauri,
  async verify(modelId: AiModelId, signal: AbortSignal) {
    return decodeModelInstallation(
      await runStorageJob(
        'verify_ai_model',
        { modelId },
        signal,
        () => undefined,
      ),
      modelId,
    );
  },
};
