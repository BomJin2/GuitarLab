import { invoke } from '@tauri-apps/api/core';
import { isRecord, isSafeUnsigned } from '../../shared/validation';

/** docs/12 "모니터 테이크 재생 v1" */
export type MonitorPlaybackSnapshot = {
  schemaVersion: 1;
  takeId: string | null;
  playing: boolean;
  positionMs: number | null;
  durationMs: number | null;
  leadFrames: number;
};
const time = (value: unknown) =>
  value === null ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0);
export function decodeMonitorPlayback(value: unknown): MonitorPlaybackSnapshot {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !(value.takeId === null || typeof value.takeId === 'string') ||
    typeof value.playing !== 'boolean' ||
    !time(value.positionMs) ||
    !time(value.durationMs) ||
    !isSafeUnsigned(value.leadFrames) ||
    (value.playing && value.positionMs === null)
  )
    throw new Error('PLAYBACK_CONTRACT_INVALID');
  return value as MonitorPlaybackSnapshot;
}
export const monitorPlaybackApi = {
  async load(projectId: string, takeId: string | null) {
    return decodeMonitorPlayback(
      await invoke<unknown>('load_monitor_playback', {
        request: { schemaVersion: 1, projectId, takeId },
      }),
    );
  },
  async set(playing: boolean, positionMs: number) {
    return decodeMonitorPlayback(
      await invoke<unknown>('set_monitor_playback', {
        request: { schemaVersion: 1, playing, positionMs },
      }),
    );
  },
  async status() {
    return decodeMonitorPlayback(await invoke<unknown>('get_monitor_playback'));
  },
};
export type MonitorPlaybackApi = typeof monitorPlaybackApi;
export const playbackErrorCode = (cause: unknown) =>
  typeof cause === 'object' && cause !== null && 'code' in cause
    ? String((cause as { code: unknown }).code)
    : 'PLAYBACK_FAILED';
const messages: Record<string, string> = {
  MONITOR_NOT_AMPLITUBE:
    '입력 모니터를 "모니터에 AmpliTube 사용"으로 켠 뒤 선택하세요.',
  PLAYBACK_NOT_LOADED: '모니터가 꺼져 AmpliTube 재생을 원음으로 바꿨습니다.',
  PLAYBACK_RATE_MISMATCH:
    '테이크와 모니터의 샘플레이트가 달라 AmpliTube로 재생할 수 없습니다.',
  MIX_LIMIT_EXCEEDED: '10분보다 긴 테이크는 AmpliTube로 재생할 수 없습니다.',
};
export function monitorPlaybackMessage(code: string) {
  return messages[code] ?? 'AmpliTube 재생에 실패해 원음으로 바꿨습니다.';
}
