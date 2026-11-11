import { invoke } from '@tauri-apps/api/core';
import {
  isUuid,
  runStorageByteJob,
  runStorageJob,
  type JobSnapshot,
} from '../library/projects';
import { decodeMonitorPlugin } from '../practice/monitorPlugin';
import { isRecord, isSafeUnsigned } from '../../shared/validation';

/** docs/12 "테이크 Freeze v1" */
export type TakeRender = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  takeId: string;
  kind: 'FREEZE' | 'BOUNCE';
  sampleRate: number;
  channels: 2;
  frames: number;
  durationMs: number;
  bytes: number;
  sha256: string;
  takeSha256: string;
  pluginClassId: string;
  pluginVersion: string;
  latencyFrames: number;
  tailFrames: number;
  createdAtMs: number;
};
/** Rust `TakeRender::validate`와 같은 한도(작업 전송 256MiB, 테이크 10분 + tail 11초). */
const MAX_RENDER_BYTES = 256 * 1024 * 1024;
const MAX_SECONDS = 611;
const hex = (value: unknown, length: number) =>
  typeof value === 'string' &&
  value.length === length &&
  /^[0-9a-fA-F]+$/.test(value);
export function decodeTakeRender(
  value: unknown,
  projectId: string,
): TakeRender {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isUuid(value.id) ||
    value.projectId !== projectId ||
    !isUuid(value.takeId) ||
    !(value.kind === 'FREEZE' || value.kind === 'BOUNCE') ||
    !isSafeUnsigned(value.sampleRate, 192000) ||
    value.sampleRate < 8000 ||
    value.channels !== 2 ||
    !isSafeUnsigned(value.frames, value.sampleRate * MAX_SECONDS) ||
    value.frames === 0 ||
    typeof value.durationMs !== 'number' ||
    Math.abs(value.durationMs - (value.frames * 1000) / value.sampleRate) >
      0.000001 ||
    !isSafeUnsigned(value.bytes, MAX_RENDER_BYTES) ||
    value.bytes !== 44 + value.frames * 8 ||
    !hex(value.sha256, 64) ||
    !hex(value.takeSha256, 64) ||
    !hex(value.pluginClassId, 32) ||
    typeof value.pluginVersion !== 'string' ||
    value.pluginVersion.length < 1 ||
    value.pluginVersion.length > 64 ||
    /\p{Cc}/u.test(value.pluginVersion) ||
    !isSafeUnsigned(value.latencyFrames, 192000) ||
    !isSafeUnsigned(value.tailFrames, value.sampleRate * 11) ||
    !isSafeUnsigned(value.createdAtMs)
  )
    throw new Error('FREEZE_CONTRACT_INVALID');
  return value as TakeRender;
}
const request = (projectId: string, takeId: string) => ({
  request: { schemaVersion: 1, projectId, takeId },
});
export const freezeApi = {
  async list(projectId: string) {
    const value = await invoke<unknown>('list_take_freezes', {
      request: { schemaVersion: 1, projectId },
    });
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      value.projectId !== projectId ||
      !Array.isArray(value.freezes) ||
      value.freezes.length > 1000
    )
      throw new Error('FREEZE_CONTRACT_INVALID');
    return value.freezes.map((f) => decodeTakeRender(f, projectId));
  },
  async freeze(
    projectId: string,
    takeId: string,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    const result = decodeTakeRender(
      await runStorageJob(
        'freeze_take',
        request(projectId, takeId).request,
        signal,
        progress,
      ),
      projectId,
    );
    if (result.takeId !== takeId) throw new Error('FREEZE_CONTRACT_INVALID');
    return result;
  },
  async read(
    projectId: string,
    takeId: string,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    const { result, bytes } = await runStorageByteJob(
      'read_take_freeze',
      request(projectId, takeId).request,
      signal,
      progress,
    );
    if (
      !isRecord(result) ||
      result.takeId !== takeId ||
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength !== result.bytes
    )
      throw new Error('FREEZE_CONTRACT_INVALID');
    return bytes;
  },
  /** docs/12 "Bounce to New Track v1": 영구 처리 결과를 만듭니다(Freeze면 들리는 그대로 복사). */
  async bounce(
    projectId: string,
    takeId: string,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    const result = decodeTakeRender(
      await runStorageJob(
        'bounce_take',
        request(projectId, takeId).request,
        signal,
        progress,
      ),
      projectId,
    );
    if (result.takeId !== takeId || result.kind !== 'BOUNCE')
      throw new Error('FREEZE_CONTRACT_INVALID');
    return result;
  },
  async listBounces(projectId: string) {
    const value = await invoke<unknown>('list_take_bounces', {
      request: { schemaVersion: 1, projectId },
    });
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      value.projectId !== projectId ||
      !Array.isArray(value.bounces) ||
      value.bounces.length > 20
    )
      throw new Error('FREEZE_CONTRACT_INVALID');
    return value.bounces.map((b) => decodeTakeRender(b, projectId));
  },
  async readBounce(
    projectId: string,
    renderId: string,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    const { result, bytes } = await runStorageByteJob(
      'read_take_bounce',
      { schemaVersion: 1, projectId, renderId },
      signal,
      progress,
    );
    if (
      !isRecord(result) ||
      result.renderId !== renderId ||
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength !== result.bytes
    )
      throw new Error('FREEZE_CONTRACT_INVALID');
    return bytes;
  },
  /** docs/12 "Bounce 삭제·관리 v1" */
  async deleteBounce(projectId: string, renderId: string) {
    const value = await invoke<unknown>('delete_take_bounce', {
      request: { schemaVersion: 1, projectId, renderId },
    });
    if (
      !isRecord(value) ||
      value.renderId !== renderId ||
      typeof value.removed !== 'boolean'
    )
      throw new Error('FREEZE_CONTRACT_INVALID');
    return value.removed;
  },
  /** docs/12 "처리된 소리 내보내기 v1": 저장 창에서 고른 새 WAV에 캐시를 그대로 씁니다. */
  async export(
    projectId: string,
    takeId: string,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    const value = await runStorageJob(
      'export_take_freeze',
      request(projectId, takeId).request,
      signal,
      progress,
    );
    if (
      !isRecord(value) ||
      value.state !== 'FREEZE_EXPORTED' ||
      value.projectId !== projectId ||
      value.takeId !== takeId ||
      !isSafeUnsigned(value.bytes) ||
      !hex(value.sha256, 64)
    )
      throw new Error('FREEZE_CONTRACT_INVALID');
    return value.bytes;
  },
  async unfreeze(projectId: string, takeId: string) {
    const value = await invoke<unknown>(
      'unfreeze_take',
      request(projectId, takeId),
    );
    if (
      !isRecord(value) ||
      value.takeId !== takeId ||
      typeof value.removed !== 'boolean'
    )
      throw new Error('FREEZE_CONTRACT_INVALID');
    return value.removed;
  },
  async restoreTone(projectId: string, takeId: string) {
    return decodeMonitorPlugin(
      await invoke<unknown>(
        'restore_take_freeze_tone',
        request(projectId, takeId),
      ),
    );
  },
};
const messages: Record<string, string> = {
  PLUGIN_IN_USE:
    '모니터를 끈 뒤 Freeze하세요(AmpliTube는 하나라 처리하는 동안 모니터를 쓸 수 없습니다).',
  PLUGIN_NOT_READY: 'AmpliTube를 먼저 불러오세요.',
  PLUGIN_BUSY: 'AmpliTube가 다른 작업 중입니다. 끝난 뒤 다시 시도하세요.',
  PLUGIN_RATE_MISMATCH:
    '테이크와 AmpliTube의 샘플레이트가 다릅니다. AmpliTube를 다시 불러오세요.',
  TAKE_NOT_READY: '완료된 테이크만 Freeze할 수 있습니다.',
  RENDER_FAILED:
    'AmpliTube로 테이크를 처리하지 못했습니다. 원본 DI는 그대로입니다.',
  FREEZE_STALE:
    '테이크가 Freeze 뒤 바뀌어 원본(DI)으로 재생합니다. 다시 Freeze하세요.',
  FREEZE_INVALID:
    'Freeze 캐시가 손상돼 원본(DI)으로 재생합니다. Unfreeze 후 다시 Freeze하세요.',
  FREEZE_NOT_FOUND: 'Freeze된 테이크가 아닙니다.',
  FREEZE_ACTIVE:
    'Freeze된 테이크는 이미 AmpliTube 톤이 들어 있어 "AmpliTube로 재생"을 쓰지 않습니다.',
  PLUGIN_STATE_MISMATCH:
    '다른 플러그인으로 Freeze한 톤이라 불러오지 않았습니다.',
  CANCELED: '작업을 취소했습니다. 원본 DI와 캐시는 그대로입니다.',
  EXPORT_DESTINATION_EXISTS:
    '기존 파일은 덮어쓰지 않습니다. 새 WAV 파일명을 고르세요.',
  RECORDING_BUSY: '녹음 중에는 내보낼 수 없습니다.',
  DISK_SPACE_LOW: '저장할 디스크 공간이 부족합니다.',
  INVALID_INPUT: '앱 데이터 폴더 밖의 위치를 고르세요.',
  BOUNCE_LIMIT: '프로젝트당 Bounce 트랙은 20개까지입니다.',
  RENDER_TOO_LARGE:
    '처리 결과가 256MB를 넘어 저장하지 않았습니다. 테이크를 짧게 나누거나 48kHz로 녹음하세요.',
  BOUNCE_NOT_FOUND: '이 프로젝트의 Bounce 트랙을 찾을 수 없습니다.',
  BOUNCE_IN_USE:
    '저장된 믹스 설정이 이 Bounce를 쓰고 있습니다. 믹스에서 빼고 설정을 저장한 뒤 지우세요.',
  MIX_LIMIT_EXCEEDED:
    '믹스 레이어가 8개라 Bounce 트랙을 넣지 못했습니다. 다른 레이어를 뺀 뒤 다시 하세요(Bounce 파일은 저장됨).',
};
export const freezeErrorCode = (cause: unknown) =>
  isRecord(cause) && typeof cause.code === 'string'
    ? cause.code
    : cause instanceof Error
      ? cause.message
      : '';
export function freezeMessage(cause: unknown) {
  return (
    messages[freezeErrorCode(cause)] ??
    'Freeze 작업에 실패했습니다. 원본 DI는 그대로입니다.'
  );
}
