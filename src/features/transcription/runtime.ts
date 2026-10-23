import { isTauri } from '@tauri-apps/api/core';
import { isRecord } from '../../shared/validation';
import { runStorageJob } from '../library/projects';

export type AiRuntime = {
  schemaVersion: 1;
  pythonVersion: string;
  models: {
    id: 'basic-pitch' | 'audio-separator';
    packageVersion: string | null;
    state: 'PACKAGE_MISSING' | 'UNVERIFIED';
    usable: false;
  }[];
};
function version(v: unknown): v is string {
  return typeof v === 'string' && /^[a-zA-Z0-9._+-]{1,128}$/.test(v);
}
export function decodeAiRuntime(value: unknown): AiRuntime {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    value.schemaVersion !== 1 ||
    !version(value.pythonVersion) ||
    !Array.isArray(value.models) ||
    value.models.length !== 2
  )
    throw new Error('AI_PROTOCOL_INVALID');
  const models = value.models.map<AiRuntime['models'][number]>(
    (m: unknown, index) => {
      const id = index === 0 ? 'basic-pitch' : 'audio-separator';
      if (
        !isRecord(m) ||
        Object.keys(m).length !== 4 ||
        m.id !== id ||
        m.usable !== false ||
        (m.packageVersion === null
          ? m.state !== 'PACKAGE_MISSING'
          : !version(m.packageVersion) || m.state !== 'UNVERIFIED')
      )
        throw new Error('AI_PROTOCOL_INVALID');
      const packageVersion = m.packageVersion;
      if (packageVersion !== null && !version(packageVersion))
        throw new Error('AI_PROTOCOL_INVALID');
      return {
        id,
        packageVersion,
        state: m.packageVersion === null ? 'PACKAGE_MISSING' : 'UNVERIFIED',
        usable: false,
      };
    },
  );
  return { schemaVersion: 1, pythonVersion: value.pythonVersion, models };
}
export const aiRuntimeApi = {
  available: isTauri,
  async inspect(signal: AbortSignal) {
    return decodeAiRuntime(
      await runStorageJob('inspect_ai_runtime', {}, signal, () => undefined),
    );
  },
};
export function aiRuntimeError(cause: unknown) {
  const code = cause instanceof Error ? cause.message : '';
  const messages: Record<string, string> = {
    AI_RUNTIME_UNAVAILABLE:
      '로컬 Python 런타임을 찾지 못했습니다. 배포용 환경 구성 상태를 확인하세요.',
    AI_RUNTIME_INTEGRITY:
      '런타임 파일이 빌드 기록과 달라 실행하지 않았습니다. 설치 파일을 확인하세요.',
    AI_PROTOCOL_INVALID: 'AI 작업 프로세스의 응답이 올바르지 않습니다.',
    AI_WORKER_TIMEOUT:
      'AI 환경 확인 시간이 초과되어 작업 프로세스를 종료했습니다.',
    AI_WORKER_FAILED:
      'AI 작업 프로세스가 실패했습니다. 모델은 다운로드하지 않았습니다.',
    AI_MODEL_MISSING:
      '선택 모델의 개발 환경 또는 필수 패키지가 없습니다. 자동 설치하지 않았습니다.',
    AI_MODEL_VERSION:
      '선택 모델의 Python 또는 패키지 버전이 고정 설치 계획과 다릅니다.',
    AI_MODEL_INTEGRITY:
      '선택 모델 파일이 없거나 크기·해시가 다릅니다. 분석하지 않았습니다.',
    AI_DOWNLOAD_CONSENT_REQUIRED: '파일 다운로드에 동의한 뒤 다시 시도하세요.',
    AI_DOWNLOAD_FAILED:
      '모델 파일을 받지 못했습니다. 네트워크를 확인하세요. 검증된 캐시는 유지했습니다.',
    AI_CACHE_INTEGRITY:
      '고정 설치 계획 또는 캐시의 크기·해시가 다릅니다. 기존 파일을 덮어쓰지 않았습니다.',
    AI_DISK_SPACE:
      '모델 파일을 저장할 여유 공간이 부족합니다. 검증된 캐시는 유지했습니다.',
    AI_CACHE_CLEANUP_FAILED:
      '미완성 다운로드 파일 정리를 확인하지 못했습니다. 기존 설치와 프로젝트는 유지했습니다.',
    AI_SETUP_VERSION:
      '개발 Python 3.10과 고정 pip·bootstrap 버전이 필요합니다.',
    AI_SETUP_PATH:
      '안전한 새 설치 경로를 확인하지 못했습니다. 기존 환경은 변경하지 않았습니다.',
    AI_SETUP_MARKER_INVALID:
      '기존 설치 정보가 올바르지 않습니다. 자동 덮어쓰기하지 않았습니다.',
    AI_SETUP_PROCESS_FAILED:
      '오프라인 패키지 설치 또는 의존성 검사가 실패했습니다.',
    AI_SETUP_SELF_TEST_FAILED:
      '자체 8음 분석 검증에 실패해 새 환경을 활성화하지 않았습니다.',
    AI_SETUP_FIXTURE_INVALID:
      '자체 검증 음원의 해시가 달라 분석하지 않았습니다.',
    AI_SETUP_TIMEOUT: '설치 검증 시간이 초과되어 작업 프로세스를 종료했습니다.',
    AI_SETUP_CLEANUP_FAILED:
      '새 임시 환경 정리를 확인하지 못했습니다. 기존 설치와 프로젝트는 보존했습니다.',
    STORAGE_BUSY: '다른 파일 작업을 마친 뒤 다시 확인하세요.',
    RECORDING_BUSY: '녹음을 저장한 뒤 AI 환경을 확인하세요.',
  };
  return (
    messages[code] ??
    'AI 환경을 확인하지 못했습니다. 프로젝트와 원본 파일은 유지했습니다.'
  );
}
