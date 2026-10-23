import { invoke } from '@tauri-apps/api/core';
import {
  isRecord,
  isNumberWithin,
  isSafeUnsigned,
} from '../../shared/validation';
import type { AudioSnapshot } from '../practice/audioInput';

export type MonitorEnvironment = 'HEADPHONES' | 'SPEAKERS' | 'OTHER';
export type ProfileKey = {
  deviceId: string;
  sampleRate: number;
  sampleFormat: string;
  channels: number;
  channelIndex: number;
  bufferFrames: number;
  monitorEnvironment: MonitorEnvironment;
};
export type DeviceProfile = {
  id: string;
  key: ProfileKey;
  biasRealMs: number;
} & (
  | { method: 'MANUAL'; jitterRealMs: null; samplesUsed: null }
  | { method: 'MEASURED'; jitterRealMs: number; samplesUsed: number }
);
export type ProfileDocument = {
  schemaVersion: 1;
  revision: number;
  profiles: DeviceProfile[];
};
export const emptyProfileDocument: ProfileDocument = {
  schemaVersion: 1,
  revision: 0,
  profiles: [],
};
function environment(value: unknown): value is MonitorEnvironment {
  return value === 'HEADPHONES' || value === 'SPEAKERS' || value === 'OTHER';
}
function key(value: unknown): value is ProfileKey {
  return (
    isRecord(value) &&
    typeof value.deviceId === 'string' &&
    value.deviceId.length > 0 &&
    value.deviceId.length <= 512 &&
    isSafeUnsigned(value.sampleRate, 192000) &&
    value.sampleRate >= 8000 &&
    typeof value.sampleFormat === 'string' &&
    ['f32', 'i16', 'i32', 'u16'].includes(value.sampleFormat) &&
    isSafeUnsigned(value.channels, 32) &&
    value.channels > 0 &&
    isSafeUnsigned(value.channelIndex, 31) &&
    value.channelIndex < value.channels &&
    isSafeUnsigned(value.bufferFrames, 192000) &&
    value.bufferFrames > 0 &&
    environment(value.monitorEnvironment)
  );
}
function profile(value: unknown): value is DeviceProfile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value.id) &&
    key(value.key) &&
    isNumberWithin(value.biasRealMs, -500, 500) &&
    ((value.method === 'MANUAL' &&
      value.jitterRealMs === null &&
      value.samplesUsed === null) ||
      (value.method === 'MEASURED' &&
        isNumberWithin(value.jitterRealMs, 0, 750) &&
        isSafeUnsigned(value.samplesUsed, 16) &&
        value.samplesUsed >= 8))
  );
}
function identity(key: ProfileKey) {
  return JSON.stringify([
    key.deviceId,
    key.sampleRate,
    key.sampleFormat,
    key.channels,
    key.channelIndex,
    key.bufferFrames,
    key.monitorEnvironment,
  ]);
}
export function decodeProfiles(value: unknown): ProfileDocument {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isSafeUnsigned(value.revision) ||
    !Array.isArray(value.profiles) ||
    value.profiles.length > 128 ||
    !value.profiles.every(profile)
  )
    throw new Error('CALIBRATION_CONTRACT_INVALID');
  const profiles = value.profiles;
  if (
    new Set(profiles.map((p) => p.id)).size !== profiles.length ||
    new Set(profiles.map((p) => identity(p.key))).size !== profiles.length
  )
    throw new Error('CALIBRATION_CONTRACT_INVALID');
  return { schemaVersion: 1, revision: value.revision, profiles };
}
export function currentProfile(
  document: ProfileDocument,
  input: AudioSnapshot,
  monitorEnvironment: MonitorEnvironment,
) {
  if (
    input.state !== 'RUNNING' ||
    input.deviceId === null ||
    input.bufferFrames === null
  )
    return undefined;
  const current: ProfileKey = {
    deviceId: input.deviceId,
    sampleRate: input.sampleRate,
    sampleFormat: input.sampleFormat,
    channels: input.channels,
    channelIndex: input.channelIndex,
    bufferFrames: input.bufferFrames,
    monitorEnvironment,
  };
  return document.profiles.find((p) => identity(p.key) === identity(current));
}
export const calibrationApi = {
  async list() {
    return decodeProfiles(await invoke<unknown>('list_input_calibrations'));
  },
  async save(
    expectedRevision: number,
    biasRealMs: number,
    monitorEnvironment: MonitorEnvironment,
    expectedStreamGeneration: number,
  ) {
    return decodeProfiles(
      await invoke<unknown>('save_input_calibration', {
        request: {
          schemaVersion: 1,
          expectedRevision,
          expectedStreamGeneration,
          biasRealMs,
          monitorEnvironment,
        },
      }),
    );
  },
};
export function calibrationError(error: unknown) {
  const code = isRecord(error)
    ? error.code
    : error instanceof Error
      ? error.message
      : '';
  if (code === 'REVISION_CONFLICT')
    return '다른 저장으로 보정값이 변경되었습니다. 다시 읽은 뒤 저장하세요.';
  if (code === 'INPUT_NOT_ACTIVE')
    return '정상 기타 입력을 시작한 뒤 저장하세요.';
  if (code === 'INPUT_CHANGED')
    return '입력 장치가 변경되었습니다. 현재 입력 설정을 확인한 뒤 저장하세요.';
  if (code === 'CALIBRATION_CONTRACT_INVALID')
    return '보정 설정 형식이 맞지 않습니다. 기존 파일을 유지했습니다.';
  if (code === 'CALIBRATION_REQUIRED')
    return '장치 버퍼 구성을 확인할 수 없습니다. 다시 연결한 뒤 확인하세요.';
  return '보정값을 읽거나 저장하지 못했습니다. 기존 값을 유지하며 다시 시도할 수 있습니다.';
}
