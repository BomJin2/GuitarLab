import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  isNumberWithin,
  isRecord,
  isSafeUnsigned,
} from '../../shared/validation';
import { isUuid, runStorageJob } from '../library/projects';

export type StemRole = 'GUITAR_FULL' | 'ACCOMPANIMENT';
export const separationCapabilities: Readonly<{
  modelId: 'htdemucs_6s';
  modelVersion: '4.1.0';
  leadRhythm: 'UNSUPPORTED';
}> = {
  modelId: 'htdemucs_6s',
  modelVersion: '4.1.0',
  leadRhythm: 'UNSUPPORTED',
};
export type SeparationInfo = {
  schemaVersion: 1;
  stemSetId: string;
  createdAtMs: number;
  projectId: string;
  assetId: string;
  inputSha256: string;
  modelId: typeof separationCapabilities.modelId;
  modelVersion: typeof separationCapabilities.modelVersion;
  modelRevision: string;
  weightsSha256: string;
  sampleRate: 44100;
  channels: 2;
  frames: number;
  durationMs: number;
  startOffsetMs: 0;
  status: 'AI_ESTIMATE';
  stems: {
    id: string;
    role: StemRole;
    sha256: string;
    peak: number;
    bytes: number;
  }[];
};
export type SeparationRequest = { projectId: string; assetId: string };
export type SeparationPreview = {
  info: SeparationInfo;
  audio: { role: StemRole; bytes: ArrayBuffer }[];
};
function invalid(): never {
  throw new Error('AI_OUTPUT_INVALID');
}
function exact(value: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function sha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
export function decodeSeparation(
  value: unknown,
  request: SeparationRequest,
): SeparationInfo {
  if (
    !isRecord(value) ||
    !exact(value, [
      'schemaVersion',
      'stemSetId',
      'createdAtMs',
      'projectId',
      'assetId',
      'inputSha256',
      'modelId',
      'modelVersion',
      'modelRevision',
      'weightsSha256',
      'sampleRate',
      'channels',
      'frames',
      'durationMs',
      'startOffsetMs',
      'status',
      'stems',
    ]) ||
    value.schemaVersion !== 1 ||
    !isUuid(value.stemSetId) ||
    !isSafeUnsigned(value.createdAtMs) ||
    value.projectId !== request.projectId ||
    value.assetId !== request.assetId ||
    !sha(value.inputSha256) ||
    value.modelId !== separationCapabilities.modelId ||
    value.modelVersion !== separationCapabilities.modelVersion ||
    value.modelRevision !== '3c5ee475be622df764938de97e4281a7b07ffa58' ||
    value.weightsSha256 !==
      'd2a1745f0744721f6b8ca5bf469b67c651ea5ed1b52998cab033b2158609d411' ||
    value.sampleRate !== 44100 ||
    value.channels !== 2 ||
    !isSafeUnsigned(value.frames, 44100 * 60) ||
    value.frames === 0 ||
    !isNumberWithin(value.durationMs, 0.001, 60000) ||
    Math.abs(value.durationMs - (value.frames * 1000) / 44100) > 0.000001 ||
    value.startOffsetMs !== 0 ||
    value.status !== 'AI_ESTIMATE' ||
    !Array.isArray(value.stems) ||
    value.stems.length !== 2
  )
    return invalid();
  const frames = value.frames;
  const stems = value.stems.map<SeparationInfo['stems'][number]>(
    (stem: unknown, index) => {
      const role: StemRole = index === 0 ? 'GUITAR_FULL' : 'ACCOMPANIMENT';
      if (
        !isRecord(stem) ||
        !exact(stem, ['id', 'role', 'sha256', 'peak', 'bytes']) ||
        !isUuid(stem.id) ||
        stem.role !== role ||
        !sha(stem.sha256) ||
        typeof stem.peak !== 'number' ||
        !Number.isFinite(stem.peak) ||
        stem.peak < 0 ||
        stem.bytes !== 44 + frames * 8
      )
        return invalid();
      return {
        id: stem.id,
        role,
        sha256: stem.sha256,
        peak: stem.peak,
        bytes: stem.bytes,
      };
    },
  );
  if (stems[0]?.id === stems[1]?.id) return invalid();
  return {
    schemaVersion: 1,
    stemSetId: value.stemSetId,
    createdAtMs: value.createdAtMs,
    projectId: request.projectId,
    assetId: request.assetId,
    inputSha256: value.inputSha256,
    modelId: separationCapabilities.modelId,
    modelVersion: separationCapabilities.modelVersion,
    modelRevision: value.modelRevision,
    weightsSha256: value.weightsSha256,
    sampleRate: 44100,
    channels: 2,
    frames,
    durationMs: value.durationMs,
    startOffsetMs: 0,
    status: 'AI_ESTIMATE',
    stems,
  };
}
async function load(
  mode: 'analyze' | 'restore',
  request: SeparationRequest,
  signal: AbortSignal,
): Promise<SeparationPreview | null> {
  let jobId: string | null = null;
  let value = await runStorageJob(
    mode === 'analyze'
      ? 'separate_project_audio'
      : 'restore_project_separation',
    request,
    signal,
    (job) => {
      jobId = job.jobId;
    },
  );
  if (signal.aborted) throw new DOMException('분리 취소', 'AbortError');
  if (mode === 'restore') {
    if (
      !isRecord(value) ||
      !exact(value, ['schemaVersion', 'separation']) ||
      value.schemaVersion !== 1
    )
      return invalid();
    value = value.separation;
    if (value === null) return null;
  }
  const info = decodeSeparation(value, request);
  if (!isUuid(jobId)) return invalid();
  const data = await invoke<unknown>('take_storage_bytes', {
    request: { schemaVersion: 1, jobId },
  });
  if (signal.aborted) throw new DOMException('분리 취소', 'AbortError');
  if (
    !(data instanceof ArrayBuffer) ||
    data.byteLength !== info.stems.reduce((sum, stem) => sum + stem.bytes, 0)
  )
    return invalid();
  let offset = 0;
  const audio = info.stems.map((stem) => {
    const bytes = data.slice(offset, offset + stem.bytes);
    offset += stem.bytes;
    return { role: stem.role, bytes };
  });
  return { info, audio };
}
export const separationApi = {
  available: isTauri,
  async analyze(
    request: SeparationRequest,
    signal: AbortSignal,
  ): Promise<SeparationPreview> {
    const value = await load('analyze', request, signal);
    if (!value) return invalid();
    return value;
  },
  restore: (request: SeparationRequest, signal: AbortSignal) =>
    load('restore', request, signal),
};
