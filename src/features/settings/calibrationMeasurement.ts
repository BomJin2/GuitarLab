import { invoke } from '@tauri-apps/api/core';
import {
  isRecord,
  isNumberWithin,
  isSafeUnsigned,
} from '../../shared/validation';
import {
  calibrationError,
  decodeProfiles,
  type MonitorEnvironment,
} from './calibration';
import {
  calibrationBeatOriginMs,
  calibrationBeatDurationMs,
} from './CalibrationClickClock';

export type CalibrationEstimate = {
  biasRealMs: number;
  jitterRealMs: number;
  samplesUsed: number;
  samplesRejected: number;
};
export type MeasurementSnapshot = {
  schemaVersion: 1;
  measurementId: string;
  state: 'COLLECTING' | 'READY' | 'CANCELED' | 'SAVED';
  sampleCount: number;
  estimate: CalibrationEstimate | null;
  estimateErrorCode: string | null;
};
function estimate(value: unknown): value is CalibrationEstimate {
  return (
    isRecord(value) &&
    isNumberWithin(value.biasRealMs, -500, 500) &&
    isNumberWithin(value.jitterRealMs, 0, 750) &&
    isSafeUnsigned(value.samplesUsed, 16) &&
    value.samplesUsed >= 8 &&
    isSafeUnsigned(value.samplesRejected, 8)
  );
}
export function decodeMeasurement(value: unknown): MeasurementSnapshot {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.measurementId !== 'string' ||
    !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value.measurementId) ||
    (value.state !== 'COLLECTING' &&
      value.state !== 'READY' &&
      value.state !== 'CANCELED' &&
      value.state !== 'SAVED') ||
    !isSafeUnsigned(value.sampleCount, 16) ||
    (value.estimate !== null && !estimate(value.estimate)) ||
    (value.estimateErrorCode !== null &&
      value.estimateErrorCode !== 'CALIBRATION_REQUIRED') ||
    (value.estimate !== null &&
      value.estimate.samplesUsed + value.estimate.samplesRejected !==
        value.sampleCount) ||
    (value.state === 'READY' && value.sampleCount !== 16) ||
    ((value.state === 'CANCELED' || value.state === 'SAVED') &&
      value.estimate !== null)
  )
    throw new Error('CALIBRATION_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    measurementId: value.measurementId,
    state: value.state,
    sampleCount: value.sampleCount,
    estimate: value.estimate,
    estimateErrorCode: value.estimateErrorCode,
  };
}
const identity = (measurementId: string) => ({
  schemaVersion: 1,
  measurementId,
});
export const measurementApi = {
  async start(
    expectedStreamGeneration: number,
    playbackEpoch: number,
    monitorEnvironment: MonitorEnvironment,
  ) {
    return decodeMeasurement(
      await invoke<unknown>('start_calibration_measurement', {
        request: {
          schemaVersion: 1,
          expectedStreamGeneration,
          playbackEpoch,
          monitorEnvironment,
          rate: 1,
          originSongMs: calibrationBeatOriginMs,
          beatDurationSongMs: calibrationBeatDurationMs,
        },
      }),
    );
  },
  async poll(measurementId: string) {
    return decodeMeasurement(
      await invoke<unknown>('get_calibration_measurement', {
        request: identity(measurementId),
      }),
    );
  },
  async cancel(measurementId: string) {
    return decodeMeasurement(
      await invoke<unknown>('cancel_calibration_measurement', {
        request: identity(measurementId),
      }),
    );
  },
  async save(measurementId: string, expectedRevision: number) {
    return decodeProfiles(
      await invoke<unknown>('save_measured_calibration', {
        request: { ...identity(measurementId), expectedRevision },
      }),
    );
  },
};
export function measurementError(error: unknown) {
  const code = isRecord(error)
    ? error.code
    : error instanceof Error
      ? error.message
      : '';
  if (code === 'CALIBRATION_REQUIRED')
    return '이상치를 제외한 유효 단음 표본이8회 이상 필요합니다. 다시 측정하세요.';
  if (code === 'CLOCK_UNCERTAIN')
    return '입력과 클릭 시간 동기화를 확인하지 못했습니다. 다시 측정하세요.';
  if (code === 'MEASUREMENT_ACTIVE')
    return '이전 측정이 진행 중입니다. 취소하거나 다시 연결한 뒤 측정하세요.';
  if (code === 'CANCELED') return '측정이 종료되었습니다. 다시 시작하세요.';
  if (
    code === 'REVISION_CONFLICT' ||
    code === 'INPUT_CHANGED' ||
    code === 'INPUT_NOT_ACTIVE'
  )
    return calibrationError(error);
  return '보정 작업을 완료하지 못했습니다. 입력·출력 상태를 확인하고 보정값을 다시 읽어주세요.';
}
