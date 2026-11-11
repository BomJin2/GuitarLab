import { invoke } from '@tauri-apps/api/core';
import { decodeDevices } from './audioInput';
import {
  isRecord,
  isNumberWithin,
  isSafeUnsigned,
} from '../../shared/validation';

export type MonitorInsertKind = 'DRY' | 'AMPLITUBE';
export type InputMonitorSnapshot = {
  schemaVersion: 1;
  state: 'STOPPED' | 'RUNNING' | 'ERROR';
  sessionId: number;
  inputGeneration: number;
  outputDeviceId: string | null;
  outputName: string | null;
  sampleRate: number;
  channels: number;
  bufferFrames: number | null;
  volume: number;
  queuedFrames: number;
  underrunFrames: number;
  droppedFrames: number;
  errorCode: string | null;
  /** docs/12 "모니터 삽입 처리 v1"의 선택 필드. 구버전 응답에는 없습니다. */
  insert?: MonitorInsertKind;
  insertUnderrunFrames?: number;
  /** DSP 입출력 링이 넘쳐 버린 프레임(2026-11-08) */
  insertDroppedFrames?: number;
  /** 플러그인 처리 오류로 무음이 된 블록(2026-11-08) */
  insertErrorBlocks?: number;
  queueTargetFrames?: number;
  insertLatencyFrames?: number;
  /** docs/12 "AmpliTube FX 랙·실시간 Bypass v1" */
  insertBypassed?: boolean;
};
export const emptyInputMonitor: InputMonitorSnapshot = {
  schemaVersion: 1,
  state: 'STOPPED',
  sessionId: 0,
  inputGeneration: 0,
  outputDeviceId: null,
  outputName: null,
  sampleRate: 0,
  channels: 0,
  bufferFrames: null,
  volume: 0.25,
  queuedFrames: 0,
  underrunFrames: 0,
  droppedFrames: 0,
  errorCode: null,
};
function snapshot(value: unknown): value is InputMonitorSnapshot {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    (value.state === 'STOPPED' ||
      value.state === 'RUNNING' ||
      value.state === 'ERROR') &&
    isSafeUnsigned(value.sessionId) &&
    isSafeUnsigned(value.inputGeneration) &&
    (value.outputDeviceId === null ||
      (typeof value.outputDeviceId === 'string' &&
        value.outputDeviceId.length <= 512)) &&
    (value.outputName === null ||
      (typeof value.outputName === 'string' &&
        value.outputName.length <= 512)) &&
    isSafeUnsigned(value.sampleRate, 192000) &&
    isSafeUnsigned(value.channels, 2) &&
    (value.bufferFrames === null ||
      (isSafeUnsigned(value.bufferFrames, 192000) && value.bufferFrames > 0)) &&
    isNumberWithin(value.volume, 0, 1) &&
    isSafeUnsigned(value.queuedFrames, 19200) &&
    isSafeUnsigned(value.underrunFrames) &&
    isSafeUnsigned(value.droppedFrames) &&
    (value.errorCode === null || typeof value.errorCode === 'string') &&
    (value.insert === undefined ||
      value.insert === 'DRY' ||
      value.insert === 'AMPLITUBE') &&
    (value.insertUnderrunFrames === undefined ||
      isSafeUnsigned(value.insertUnderrunFrames)) &&
    (value.insertDroppedFrames === undefined ||
      isSafeUnsigned(value.insertDroppedFrames)) &&
    (value.insertErrorBlocks === undefined ||
      isSafeUnsigned(value.insertErrorBlocks)) &&
    (value.queueTargetFrames === undefined ||
      isSafeUnsigned(value.queueTargetFrames, 19200)) &&
    (value.insertLatencyFrames === undefined ||
      isSafeUnsigned(value.insertLatencyFrames, 192000)) &&
    (value.insertBypassed === undefined ||
      typeof value.insertBypassed === 'boolean') &&
    (value.state !== 'RUNNING' ||
      (value.sampleRate >= 8000 &&
        value.channels >= 1 &&
        value.sessionId > 0 &&
        value.inputGeneration > 0 &&
        typeof value.outputDeviceId === 'string' &&
        value.outputDeviceId.length > 0 &&
        typeof value.outputName === 'string' &&
        value.outputName.length > 0))
  );
}
/** 모니터 지연의 구성 추정(ms). 입력 버퍼·드라이버는 빠져 있어 실제 왕복 측정값이 아닙니다. */
export function monitorLatencyEstimateMs(
  value: InputMonitorSnapshot,
): number | null {
  if (
    value.state !== 'RUNNING' ||
    value.sampleRate <= 0 ||
    value.queueTargetFrames === undefined ||
    value.bufferFrames === null
  )
    return null;
  const frames =
    value.queueTargetFrames +
    value.bufferFrames +
    (value.insertLatencyFrames ?? 0);
  return (frames * 1000) / value.sampleRate;
}
export function decodeInputMonitor(value: unknown): InputMonitorSnapshot {
  if (!snapshot(value)) throw new Error('MONITOR_CONTRACT_INVALID');
  return value;
}
export const inputMonitorApi = {
  async outputs() {
    return decodeDevices(await invoke<unknown>('list_monitor_outputs'));
  },
  async status() {
    return decodeInputMonitor(await invoke<unknown>('get_input_monitor'));
  },
  async start(
    expectedStreamGeneration: number,
    outputDeviceId: string,
    volume: number,
    insert: MonitorInsertKind = 'DRY',
  ) {
    return decodeInputMonitor(
      await invoke<unknown>('start_input_monitor', {
        request: {
          schemaVersion: 1,
          expectedStreamGeneration,
          outputDeviceId,
          volume,
          // 기존 요청 모양을 지키려고 DRY일 때는 보내지 않습니다.
          ...(insert === 'AMPLITUBE' ? { insert } : {}),
        },
      }),
    );
  },
  async stop() {
    return decodeInputMonitor(
      await invoke<unknown>('stop_input_monitor', {
        request: { schemaVersion: 1 },
      }),
    );
  },
  async volume(sessionId: number, volume: number) {
    return decodeInputMonitor(
      await invoke<unknown>('set_input_monitor_volume', {
        request: { schemaVersion: 1, sessionId, volume },
      }),
    );
  },
  async bypass(sessionId: number, bypassed: boolean) {
    return decodeInputMonitor(
      await invoke<unknown>('set_input_monitor_bypass', {
        request: { schemaVersion: 1, sessionId, bypassed },
      }),
    );
  },
};
export function monitorError(error: unknown): string {
  const code = isRecord(error)
    ? error.code
    : error instanceof Error
      ? error.message
      : '';
  switch (code) {
    case 'INPUT_NOT_ACTIVE':
    case 'INPUT_CHANGED':
      return '정상 기타 입력을 시작한 뒤 모니터를 켜주세요.';
    case 'MONITOR_RATE_UNSUPPORTED':
      return 'Windows 입력·출력 샘플레이트를 같게 설정해주세요. 현재 모니터는 리샘플링을 지원하지 않습니다.';
    case 'MONITOR_ALREADY_ACTIVE':
      return '모니터를 끈 뒤 출력 장치를 바꿔주세요.';
    case 'MONITOR_CHANGED':
      return '모니터 상태가 변경됐습니다. 현재 상태를 확인해주세요.';
    case 'UNSUPPORTED_FORMAT':
      return '지원되지 않는 출력 포맷입니다. mono/stereo 출력을 선택해주세요.';
    case 'INVALID_INPUT':
      return '출력 장치·음량·계약 버전을 확인해주세요.';
    case 'MONITOR_NOT_AMPLITUBE':
      return '모니터를 AmpliTube로 켠 뒤 Bypass를 쓰세요.';
    case 'MONITOR_CONTRACT_INVALID':
      return '모니터 응답 형식이 맞지 않습니다. 앱을 다시 시작해주세요.';
    default:
      return '모니터 출력에 연결하지 못했습니다. 출력 장치를 확인하고 다시 켜주세요.';
  }
}
