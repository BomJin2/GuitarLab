import { invoke, isTauri } from '@tauri-apps/api/core';
import type { GuitarPartRole } from '../../entities/score';
import { isGuitarPartRole } from '../../entities/guitarRoles';
import {
  isRecord,
  isNumberWithin,
  isSafeUnsigned,
} from '../../shared/validation';
import { isUuid, runStorageJob, type JobSnapshot } from '../library/projects';
export type ImportedGuitarStem = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  name: string;
  role: GuitarPartRole;
  origin: 'USER_IMPORTED';
  sampleRate: number;
  channels: 1 | 2;
  frames: number;
  durationMs: number;
  bytes: number;
  sha256: string;
  peak: number;
  createdAtMs: number;
};
function invalid(): never {
  throw new Error('IMPORTED_STEM_CONTRACT_INVALID');
}
export function decodeImportedStem(
  value: unknown,
  projectId: string,
): ImportedGuitarStem {
  if (
    !isUuid(projectId) ||
    !isRecord(value) ||
    Object.keys(value).length !== 14 ||
    value.schemaVersion !== 1 ||
    !isUuid(value.id) ||
    value.projectId !== projectId ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    [...value.name].length > 200 ||
    /\p{Cc}/u.test(value.name) ||
    !isGuitarPartRole(value.role) ||
    value.origin !== 'USER_IMPORTED' ||
    !isSafeUnsigned(value.sampleRate, 192000) ||
    value.sampleRate < 8000 ||
    (value.channels !== 1 && value.channels !== 2) ||
    !isSafeUnsigned(value.frames, value.sampleRate * 600) ||
    value.frames === 0 ||
    !isNumberWithin(value.durationMs, 0, 600000) ||
    Math.abs(value.durationMs - (value.frames * 1000) / value.sampleRate) >
      0.000001 ||
    !isSafeUnsigned(value.bytes, 64 * 1024 * 1024) ||
    value.bytes < 44 ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !isNumberWithin(value.peak, 0, Number.MAX_VALUE) ||
    !isSafeUnsigned(value.createdAtMs)
  )
    invalid();
  return {
    schemaVersion: 1,
    id: value.id,
    projectId,
    name: value.name,
    role: value.role,
    origin: 'USER_IMPORTED',
    sampleRate: value.sampleRate,
    channels: value.channels,
    frames: value.frames,
    durationMs: value.durationMs,
    bytes: value.bytes,
    sha256: value.sha256,
    peak: value.peak,
    createdAtMs: value.createdAtMs,
  };
}
function resultStem(value: unknown, projectId: string): ImportedGuitarStem {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    value.schemaVersion !== 1
  )
    invalid();
  return decodeImportedStem(value.stem, projectId);
}
export const importedStemsApi = {
  available: isTauri,
  async import(
    projectId: string,
    role: GuitarPartRole,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    if (!isUuid(projectId) || !isGuitarPartRole(role)) invalid();
    const value = await runStorageJob(
      'import_guitar_stem',
      { projectId, role },
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (signal.aborted) throw new DOMException('기타 파일 취소', 'AbortError');
    const stem = resultStem(value, projectId);
    if (stem.role !== role) invalid();
    return stem;
  },
  async list(
    projectId: string,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    if (!isUuid(projectId)) invalid();
    const value = await runStorageJob(
      'list_imported_guitar_stems',
      { projectId },
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (signal.aborted) throw new DOMException('목록 조회 취소', 'AbortError');
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 3 ||
      value.schemaVersion !== 1 ||
      value.projectId !== projectId ||
      !Array.isArray(value.stems) ||
      value.stems.length > 20
    )
      invalid();
    const stems = value.stems.map((stem) =>
      decodeImportedStem(stem, projectId),
    );
    if (new Set(stems.map((stem) => stem.id)).size !== stems.length) invalid();
    return stems;
  },
  async read(
    projectId: string,
    stemId: string,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    if (!isUuid(projectId) || !isUuid(stemId)) invalid();
    let jobId = '';
    const value = await runStorageJob(
      'read_imported_guitar_stem',
      { projectId, stemId },
      signal,
      (job) => {
        jobId = job.jobId;
        progress(job);
      },
      { waitForCancellation: true },
    );
    if (signal.aborted)
      throw new DOMException('기타 파일 읽기 취소', 'AbortError');
    const stem = resultStem(value, projectId);
    if (stem.id !== stemId || !isUuid(jobId)) invalid();
    const bytes = await invoke<unknown>('take_storage_bytes', {
      request: { schemaVersion: 1, jobId },
    });
    if (signal.aborted)
      throw new DOMException('기타 파일 읽기 취소', 'AbortError');
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== stem.bytes)
      invalid();
    return { stem, bytes };
  },
};
export function importedStemError(cause: unknown): string {
  const code =
    isRecord(cause) && typeof cause.code === 'string'
      ? cause.code
      : cause instanceof Error
        ? cause.message
        : '';
  switch (code) {
    case 'STORAGE_BUSY':
      return '다른 파일 작업을 마치거나 취소해주세요.';
    case 'RECORDING_BUSY':
      return '녹음 STOP과 저장 후 기타 파일을 불러오세요.';
    case 'IMPORTED_STEM_LIMIT':
      return '프로젝트의 사용자 기타 파일20개 한도입니다.';
    case 'DISK_SPACE_LOW':
      return '저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도해주세요.';
    case 'IMPORTED_STEM_INVALID':
    case 'IMPORTED_STEM_CONTRACT_INVALID':
      return '기타 파일의 WAV 형식·길이·저장 무결성을 확인해주세요.';
    default:
      return '기타 파일 작업을 완료하지 못했습니다. 기존 원본은 유지됩니다. 목록을 다시 읽어 저장 상태를 확인하세요.';
  }
}
