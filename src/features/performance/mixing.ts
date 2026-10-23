import { invoke } from '@tauri-apps/api/core';
import {
  isRecord,
  isNumberWithin,
  isSafeUnsigned,
} from '../../shared/validation';
import { isUuid, runStorageJob, type JobSnapshot } from '../library/projects';
export type MixLayer = {
  kind: 'TAKE' | 'LOCAL_ASSET' | 'STEM' | 'IMPORTED_STEM';
  id: string;
  gain: number;
  mute: boolean;
  solo: boolean;
  offsetMs: number;
};
export type MixDocument = {
  schemaVersion: 1;
  projectId: string;
  masterGain: number;
  layers: MixLayer[];
};
export type MixStats = {
  schemaVersion: 1;
  frames: number;
  sampleRate: 48000;
  channels: 1;
  peak: number;
  limitedFrames: number;
  bytes: number;
};
export function decodeMix(value: unknown): MixDocument {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isUuid(value.projectId) ||
    !isNumberWithin(value.masterGain, 0, 1) ||
    !Array.isArray(value.layers) ||
    value.layers.length > 8
  )
    throw new Error('MIX_CONTRACT_INVALID');
  const layers: MixLayer[] = value.layers.map((layer: unknown) => {
    if (
      !isRecord(layer) ||
      (layer.kind !== 'TAKE' &&
        layer.kind !== 'LOCAL_ASSET' &&
        layer.kind !== 'STEM' &&
        layer.kind !== 'IMPORTED_STEM') ||
      !isUuid(layer.id) ||
      !isNumberWithin(layer.gain, 0, 1) ||
      typeof layer.mute !== 'boolean' ||
      typeof layer.solo !== 'boolean' ||
      !isNumberWithin(layer.offsetMs, -60000, 60000)
    )
      throw new Error('MIX_CONTRACT_INVALID');
    return {
      kind: layer.kind,
      id: layer.id,
      gain: layer.gain,
      mute: layer.mute,
      solo: layer.solo,
      offsetMs: layer.offsetMs,
    };
  });
  if (
    new Set(layers.map((l) => l.id)).size !== layers.length ||
    layers.filter((l) => l.kind === 'LOCAL_ASSET').length > 1
  )
    throw new Error('MIX_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    projectId: value.projectId,
    masterGain: value.masterGain,
    layers,
  };
}
export function decodeMixStats(value: unknown): MixStats {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isSafeUnsigned(value.frames, 28800000) ||
    value.frames === 0 ||
    value.sampleRate !== 48000 ||
    value.channels !== 1 ||
    !isNumberWithin(value.peak, 0, Number.MAX_VALUE) ||
    !isSafeUnsigned(value.limitedFrames, value.frames) ||
    value.bytes !== 58 + value.frames * 4
  )
    throw new Error('MIX_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    frames: value.frames,
    sampleRate: 48000,
    channels: 1,
    peak: value.peak,
    limitedFrames: value.limitedFrames,
    bytes: value.bytes,
  };
}
export function layerVolume(mix: MixDocument, layer: MixLayer) {
  return layer.mute || (mix.layers.some((l) => l.solo) && !layer.solo)
    ? 0
    : layer.gain * mix.masterGain;
}
export const mixApi = {
  async readStem(
    projectId: string,
    assetId: string,
    stemId: string,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    if (![projectId, assetId, stemId].every(isUuid))
      throw new Error('MIX_CONTRACT_INVALID');
    let jobId = '';
    const value = await runStorageJob(
      'read_project_stem',
      { projectId, assetId, stemId },
      signal,
      (job) => {
        jobId = job.jobId;
        progress(job);
      },
    );
    if (signal.aborted) throw new DOMException('믹스 취소', 'AbortError');
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 5 ||
      value.schemaVersion !== 1 ||
      value.projectId !== projectId ||
      value.assetId !== assetId ||
      value.stemId !== stemId ||
      !isSafeUnsigned(value.bytes, 21168044) ||
      value.bytes <= 44
    )
      throw new Error('MIX_CONTRACT_INVALID');
    const bytes = await invoke<unknown>('take_storage_bytes', {
      request: { schemaVersion: 1, jobId },
    });
    if (signal.aborted) throw new DOMException('믹스 취소', 'AbortError');
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== value.bytes)
      throw new Error('MIX_CONTRACT_INVALID');
    return bytes;
  },
  async load(projectId: string) {
    const value = await invoke<unknown>('get_project_mix', {
      request: { schemaVersion: 1, projectId },
    });
    if (!isRecord(value) || value.schemaVersion !== 1)
      throw new Error('MIX_CONTRACT_INVALID');
    const mix = value.mix === null ? null : decodeMix(value.mix);
    if (mix && mix.projectId !== projectId)
      throw new Error('MIX_CONTRACT_INVALID');
    return mix;
  },
  async save(mix: MixDocument) {
    decodeMix(mix);
    const value = await invoke<unknown>('save_project_mix', { request: mix });
    if (!isRecord(value) || value.schemaVersion !== 1)
      throw new Error('MIX_CONTRACT_INVALID');
    const saved = decodeMix(value.mix);
    if (saved.projectId !== mix.projectId)
      throw new Error('MIX_CONTRACT_INVALID');
    return saved;
  },
  async render(
    mix: MixDocument,
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
  ) {
    decodeMix(mix);
    let jobId = '';
    const stats = decodeMixStats(
      await runStorageJob('render_project_mix', mix, signal, (v) => {
        jobId = v.jobId;
        progress(v);
      }),
    );
    if (signal.aborted) throw new DOMException('믹스 취소', 'AbortError');
    const bytes = await invoke<unknown>('take_storage_bytes', {
      request: { schemaVersion: 1, jobId },
    });
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== stats.bytes)
      throw new Error('MIX_CONTRACT_INVALID');
    return { bytes, stats };
  },
  async export(
    mix: MixDocument,
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
  ) {
    decodeMix(mix);
    return decodeMixStats(
      await runStorageJob(
        'export_project_mix',
        { mix, localRightsConfirmed: true },
        signal,
        progress,
      ),
    );
  },
};
export function mixError(cause: unknown) {
  const code =
    isRecord(cause) && typeof cause.code === 'string'
      ? cause.code
      : cause instanceof Error
        ? cause.message
        : '';
  switch (code) {
    case 'MIX_STEM_LIVE_UNSUPPORTED':
      return '분리 음원은 현재 출력 믹스 만들기·미리 듣기·WAV 내보내기를 지원합니다. 연주 중 오버더빙 연결은 후속 작업입니다.';
    case 'AI_OUTPUT_INVALID':
      return '저장된 분리 결과가 없거나 손상되었습니다. 카피 화면에서 결과와 원본 연결을 확인하세요.';
    case 'MIX_SOURCE_UNAVAILABLE':
    case 'RECORDING_REFERENCE_INVALID':
      return '오버더빙은 현재 프로젝트의 저장 악보 리비전·반주와 연결된 READY 테이크를 사용합니다. 반주를 연결하고 해당 테이크를 선택하세요.';
    case 'MIX_RATE_UNSUPPORTED':
      return 'WAV 믹스 출력은1× 정렬 테이크 또는 무반주 테이크를 지원합니다. 배속 녹음은 오버더빙 청취만 가능합니다.';
    case 'MIX_FORMAT_UNSUPPORTED':
      return '믹스 출력 반주는 PCM16/float32 mono·stereo WAV만 지원합니다. MP3/다른 WAV는 재생만 가능합니다.';
    case 'MIX_LIMIT_EXCEEDED':
      return '믹스 입력 합계64MiB·출력10분/256MiB 제한을 넘었습니다.';
    case 'MIX_DESTINATION_EXISTS':
      return '기존 파일은 덮어쓰지 않습니다. 새 WAV 파일명을 선택하세요.';
    case 'MIX_EMPTY':
      return '소리가 나는 레이어가 없습니다. 음소거·solo·오프셋을 확인하세요.';
    case 'STORAGE_BUSY':
      return '다른 파일 작업을 마치거나 선택 창을 취소하세요.';
    default:
      return '믹스를 준비하거나 저장하지 못했습니다. 원본은 보존됩니다. 설정·파일 상태를 확인하세요.';
  }
}
