import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  isRecord as record,
  isNumberWithin as number,
  isSafeUnsigned as integer,
} from '../../shared/validation';

export type DeviceInfo = {
  id: string;
  name: string;
  channels: number;
  sampleRate: number;
  sampleFormat: string;
  isDefault?: boolean;
};
export type InputOnset = {
  sequence: number;
  captureSampleIndex: number;
  capturedMonotonicNs: string;
  pitchMidi: number | null;
  confidence: number;
};
export type AudioSnapshot = {
  schemaVersion: 1;
  state: 'STOPPED' | 'STARTING' | 'RUNNING' | 'ERROR';
  streamGeneration: number;
  deviceId: string | null;
  sampleRate: number;
  channels: number;
  channelIndex: number;
  sampleFormat: string;
  callbackFrames: number;
  bufferFrames: number | null;
  noiseGateDbfs: number;
  capturedFrames: number;
  droppedFrames: number;
  discontinuities: number;
  levelDbfs: number;
  fullScaleFrames?: number;
  pitchMidi: number | null;
  confidence: number | null;
  capturedMonotonicNs: string;
  onsets: InputOnset[];
  judgementWatermarkNs: string;
  errorCode: string | null;
};
export const emptyAudioSnapshot: AudioSnapshot = {
  schemaVersion: 1,
  state: 'STOPPED',
  streamGeneration: 0,
  deviceId: null,
  sampleRate: 0,
  channels: 0,
  channelIndex: 0,
  sampleFormat: '',
  noiseGateDbfs: -50,
  callbackFrames: 0,
  bufferFrames: null,
  capturedFrames: 0,
  droppedFrames: 0,
  discontinuities: 0,
  levelDbfs: -120,
  fullScaleFrames: 0,
  pitchMidi: null,
  confidence: null,
  capturedMonotonicNs: '0',
  judgementWatermarkNs: '0',
  onsets: [],
  errorCode: null,
};
function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{1,20}$/.test(value) &&
    BigInt(value) <= 18446744073709551615n
  );
}
function onset(value: unknown): value is InputOnset {
  return (
    record(value) &&
    integer(value.sequence) &&
    integer(value.captureSampleIndex) &&
    timestamp(value.capturedMonotonicNs) &&
    (value.pitchMidi === null || number(value.pitchMidi, 0, 127)) &&
    number(value.confidence, 0, 1) &&
    (value.pitchMidi !== null || value.confidence === 0)
  );
}
function snapshot(value: unknown): value is AudioSnapshot {
  return (
    record(value) &&
    value.schemaVersion === 1 &&
    (value.state === 'STOPPED' ||
      value.state === 'STARTING' ||
      value.state === 'RUNNING' ||
      value.state === 'ERROR') &&
    integer(value.streamGeneration) &&
    (value.deviceId === null || typeof value.deviceId === 'string') &&
    integer(value.sampleRate, 192000) &&
    integer(value.channels, 32) &&
    integer(value.channelIndex, 31) &&
    typeof value.sampleFormat === 'string' &&
    number(value.noiseGateDbfs, -80, -10) &&
    integer(value.callbackFrames) &&
    (value.bufferFrames === null ||
      (integer(value.bufferFrames, 192000) && value.bufferFrames > 0)) &&
    integer(value.capturedFrames) &&
    integer(value.droppedFrames) &&
    integer(value.discontinuities) &&
    number(value.levelDbfs, -120, 0) &&
    (value.fullScaleFrames === undefined ||
      integer(value.fullScaleFrames, Number(value.capturedFrames))) &&
    (value.pitchMidi === null || number(value.pitchMidi, 0, 127)) &&
    (value.confidence === null || number(value.confidence, 0, 1)) &&
    timestamp(value.capturedMonotonicNs) &&
    timestamp(value.judgementWatermarkNs) &&
    BigInt(value.judgementWatermarkNs) <= BigInt(value.capturedMonotonicNs) &&
    Array.isArray(value.onsets) &&
    value.onsets.length <= 128 &&
    value.onsets.every(onset) &&
    (value.errorCode === null || typeof value.errorCode === 'string')
  );
}
export function decodeSnapshot(value: unknown): AudioSnapshot {
  if (!snapshot(value)) throw new Error('AUDIO_CONTRACT_INVALID');
  return value;
}
export function decodeDevices(value: unknown): DeviceInfo[] {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.devices) ||
    value.devices.length > 256
  )
    throw new Error('AUDIO_CONTRACT_INVALID');
  return value.devices.map((device: unknown) => {
    if (
      !record(device) ||
      typeof device.id !== 'string' ||
      !device.id.length ||
      device.id.length > 512 ||
      typeof device.name !== 'string' ||
      device.name.length > 512 ||
      !integer(device.channels, 32) ||
      device.channels === 0 ||
      !integer(device.sampleRate, 192000) ||
      device.sampleRate < 8000 ||
      typeof device.sampleFormat !== 'string' ||
      (device.isDefault !== undefined && typeof device.isDefault !== 'boolean')
    )
      throw new Error('AUDIO_CONTRACT_INVALID');
    return {
      id: device.id,
      name: device.name,
      channels: device.channels,
      sampleRate: device.sampleRate,
      sampleFormat: device.sampleFormat,
      ...(device.isDefault === undefined
        ? {}
        : { isDefault: device.isDefault }),
    };
  });
}
export const audioInput = {
  available: isTauri,
  async devices() {
    return decodeDevices(await invoke<unknown>('list_audio_devices'));
  },
  async status() {
    return decodeSnapshot(await invoke<unknown>('get_audio_snapshot'));
  },
  async start(deviceId: string, channelIndex: number, noiseGateDbfs: number) {
    return decodeSnapshot(
      await invoke<unknown>('start_audio_input', {
        request: { schemaVersion: 1, deviceId, channelIndex, noiseGateDbfs },
      }),
    );
  },
  async stop() {
    return decodeSnapshot(
      await invoke<unknown>('stop_audio_input', {
        request: { schemaVersion: 1 },
      }),
    );
  },
};
export function inputError(error: unknown): string {
  const code = record(error)
    ? error.code
    : error instanceof Error
      ? error.message
      : '';
  switch (code) {
    case 'AUDIO_PERMISSION_DENIED':
      return 'Windows 마이크 권한을 허용한 뒤 다시 시도하세요.';
    case 'INPUT_ALREADY_ACTIVE':
      return '현재 입력을 중단한 뒤 다른 장치를 선택하세요.';
    case 'UNSUPPORTED_FORMAT':
      return '지원되지 않는 장치 포맷입니다. Windows 입력 설정을 확인하세요.';
    case 'INVALID_INPUT':
      return '장치·입력 채널·노이즈 게이트 범위를 확인하세요.';
    case 'AUDIO_CONTRACT_INVALID':
      return '입력 상태 응답 형식이 맞지 않습니다. 앱을 다시 시작하세요.';
    default:
      return '입력 장치에 연결할 수 없습니다. 연결과 권한을 확인한 뒤 다시 시도하세요.';
  }
}
