import { isTauri } from '@tauri-apps/api/core';
import {
  isNumberWithin,
  isRecord,
  isSafeUnsigned,
} from '../../shared/validation';
import { isUuid, runStorageJob, type JobSnapshot } from '../library/projects';
import type { RecordedTake } from './recordings';

export const pitchWarningLabels = {
  EXPERIMENTAL: '실험적 스펙트럼 후보이며 정답이나 코드 판정이 아닙니다.',
  OCTAVE_VOICES_AMBIGUOUS:
    '배음과 겹치는 옥타브 성부·같은 음의 여러 줄은 구분하지 못할 수 있습니다.',
  HARMONICS_SUPPRESSED:
    '배음으로 보이는 성분을 제외했습니다. 실제 높은 성부도 빠질 수 있습니다.',
  CLIPPED:
    '클리핑이 있어 분석을 보류했습니다. 입력 게인을 낮춰 다시 녹음하세요.',
  LOW_LEVEL:
    '음량이 너무 작거나 무음입니다. 기타 소리가 남아 있는 구간을 선택하세요.',
  NOISY: '잡음 성분이 많아 후보를 확정하지 않았습니다.',
  TOO_MANY_PITCHES: '독립 후보가6개를 넘어 분석을 보류했습니다.',
  NO_PEAKS: '지원 음역에서 뚜렷한 후보를 찾지 못했습니다.',
};
type PitchWarning = keyof typeof pitchWarningLabels;
export type RecordedPitches = {
  schemaVersion: 1;
  projectId: string;
  takeId: string;
  startMs: number;
  durationMs: number;
  frames: number;
  sampleRate: number;
  method: 'SPECTRAL_PEAK_EXPERIMENTAL';
  state: 'CANDIDATES' | 'SILENT' | 'UNVERIFIED';
  rmsDbfs: number;
  pitches: { midi: number; salience: number }[];
  warnings: PitchWarning[];
};
const invalid = (): never => {
  throw new Error('CHORD_ANALYSIS_INVALID');
};
function isWarning(value: unknown): value is PitchWarning {
  return typeof value === 'string' && Object.hasOwn(pitchWarningLabels, value);
}
export function pitchAnalysisErrorCode(
  take: RecordedTake,
  startMs: number,
  durationMs: 400 | 1000 = 400,
): string | null {
  if (
    take.state !== 'READY' ||
    take.droppedFrames > 0 ||
    take.warningIntervals.length > 0
  )
    return 'CHORD_TAKE_UNVERIFIED';
  if (
    take.frames > take.sampleRate * 30 ||
    58 + take.frames * 4 > 16 * 1024 * 1024
  )
    return 'CHORD_TAKE_LIMIT';
  if (
    !isNumberWithin(startMs, 0, 30000) ||
    Math.floor((startMs * take.sampleRate) / 1000) +
      Math.floor((take.sampleRate * durationMs) / 1000) >
      take.frames
  )
    return durationMs === 1000
      ? 'PITCH_TRACK_WINDOW_INVALID'
      : 'CHORD_WINDOW_INVALID';
  return null;
}
export function decodeRecordedPitches(
  value: unknown,
  take: RecordedTake,
  requestedStartMs: number,
): RecordedPitches {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 12 ||
    value.schemaVersion !== 1 ||
    value.projectId !== take.projectId ||
    value.takeId !== take.id ||
    value.sampleRate !== take.sampleRate ||
    !isSafeUnsigned(value.frames, 76800) ||
    value.frames !== Math.floor((take.sampleRate * 2) / 5) ||
    value.method !== 'SPECTRAL_PEAK_EXPERIMENTAL' ||
    (value.state !== 'CANDIDATES' &&
      value.state !== 'SILENT' &&
      value.state !== 'UNVERIFIED') ||
    !isNumberWithin(value.startMs, 0, 30000) ||
    Math.abs(
      value.startMs -
        (Math.floor((requestedStartMs * take.sampleRate) / 1000) * 1000) /
          take.sampleRate,
    ) > 1e-6 ||
    !isNumberWithin(value.durationMs, 399.75, 400) ||
    Math.abs(value.durationMs - (value.frames * 1000) / take.sampleRate) >
      1e-6 ||
    !isNumberWithin(value.rmsDbfs, -120, 120) ||
    !Array.isArray(value.pitches) ||
    value.pitches.length > 6 ||
    !Array.isArray(value.warnings) ||
    value.warnings.length > 8
  )
    return invalid();
  const pitches = value.pitches.map((pitch: unknown) => {
    if (
      !isRecord(pitch) ||
      Object.keys(pitch).length !== 2 ||
      !isNumberWithin(pitch.midi, 39.5, 88.5) ||
      !isNumberWithin(pitch.salience, 0, 1)
    )
      return invalid();
    return { midi: pitch.midi, salience: pitch.salience };
  });
  const warnings = value.warnings.map((warning: unknown) =>
    isWarning(warning) ? warning : invalid(),
  );
  if (
    !warnings.includes('EXPERIMENTAL') ||
    !warnings.includes('OCTAVE_VOICES_AMBIGUOUS') ||
    new Set(warnings).size !== warnings.length ||
    pitches.some(
      (pitch, index) =>
        index > 0 && pitch.midi <= (pitches[index - 1]?.midi ?? Infinity),
    ) ||
    (value.state === 'CANDIDATES'
      ? pitches.length === 0
      : pitches.length !== 0) ||
    (value.state === 'SILENT' &&
      (!warnings.includes('LOW_LEVEL') || value.rmsDbfs >= -65))
  )
    return invalid();
  return {
    schemaVersion: 1,
    projectId: take.projectId,
    takeId: take.id,
    startMs: value.startMs,
    durationMs: value.durationMs,
    frames: value.frames,
    sampleRate: take.sampleRate,
    method: 'SPECTRAL_PEAK_EXPERIMENTAL',
    state: value.state,
    rmsDbfs: value.rmsDbfs,
    pitches,
    warnings,
  };
}
export const recordedPitchesApi = {
  available: isTauri,
  async analyze(
    take: RecordedTake,
    startMs: number,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    if (!isUuid(take.projectId) || !isUuid(take.id)) return invalid();
    const reason = pitchAnalysisErrorCode(take, startMs);
    if (reason) throw new Error(reason);
    const value = await runStorageJob(
      'analyze_recording_pitches',
      { projectId: take.projectId, takeId: take.id, startMs },
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (signal.aborted) throw new DOMException('분석 취소', 'AbortError');
    return decodeRecordedPitches(value, take, startMs);
  },
};
export function recordedPitchesError(cause: unknown): string {
  const code =
    cause instanceof Error
      ? cause.message
      : isRecord(cause) && typeof cause.code === 'string'
        ? cause.code
        : '';
  const messages: Record<string, string> = {
    CHORD_TAKE_UNVERIFIED: '누락 없는 READY 테이크를 선택하세요.',
    CHORD_TAKE_LIMIT: '실험 분석은30초/16MiB 이하 테이크만 지원합니다.',
    CHORD_WINDOW_INVALID:
      '녹음 안의 시작 시각을 입력하세요. 뒤에400ms 이상 남아 있어야 합니다.',
    PITCH_TRACK_WINDOW_INVALID:
      '녹음 안의 시작 시각을 입력하세요. 뒤에1초 이상 남아 있어야 합니다.',
    PITCH_TRACK_ANALYSIS_INVALID:
      '음정 변화 응답이 현재 테이크·구간 계약과 달라 표시하지 않았습니다.',
    CHORD_ANALYSIS_INVALID:
      '분석 응답이 현재 테이크·구간 계약과 달라 표시하지 않았습니다.',
    RECORDING_BUSY: '녹음 STOP·저장을 마친 뒤 분석하세요.',
    STORAGE_BUSY: '다른 파일 작업이 끝난 뒤 다시 분석하세요.',
    WAV_INVALID: '테이크의 파일 무결성을 확인하지 못했습니다.',
    TAKE_FILE_MISSING: '저장된 테이크 파일을 찾지 못했습니다.',
  };
  return (
    messages[code] ?? '구간을 분석하지 못했습니다. 원본 녹음은 유지했습니다.'
  );
}
