import { isTauri } from '@tauri-apps/api/core';
import { isNumberWithin, isRecord } from '../../shared/validation';
import { isUuid, runStorageJob, type JobSnapshot } from '../library/projects';
import {
  pitchAnalysisErrorCode,
  MAX_RECORDED_ANALYSIS_START_MS,
} from './recordedPitches';
import type { RecordedTake } from './recordings';

export const motionLabels = {
  STEADY: '음정 유지 후보',
  RISING: '음정 상승 후보',
  FALLING: '음정 하강 후보',
  OSCILLATING: '주기적 음정 흔들림 후보',
  UNVERIFIED: '음정 변화 분석 보류',
};
export const trackWarningLabels = {
  EXPERIMENTAL: '실험적 단음 궤적이며 정답 판정이 아닙니다.',
  MONOPHONIC_ONLY:
    '깨끗한 단음 전용입니다. 화음·왜곡·배음에 의한 오차가 생길 수 있습니다.',
  NOT_TECHNIQUE_CLASSIFICATION:
    '음정 변화만으로 벤딩·슬라이드·레가토를 구분하지 않습니다. 점수에는 반영하지 않습니다.',
  CLIPPED: '클리핑이 있어 분석을 보류했습니다. 입력 게인을 낮춰주세요.',
  LOW_LEVEL: '음량이 너무 작거나 무음입니다.',
  LOW_COVERAGE: '주기성이 충분한 단음 구간이 부족해 분석을 보류했습니다.',
  NON_MONOTONIC_OR_AMBIGUOUS:
    '도약·진동 등 변화가 모호하여 상승·하강을 확정하지 않았습니다.',
};
type TrackWarning = keyof typeof trackWarningLabels;
export type PitchTrackPoint = {
  timeMs: number;
  pitchMidi: number | null;
  confidence: number | null;
};
export type RecordedPitchTrack = {
  schemaVersion: 1 | 2;
  projectId: string;
  takeId: string;
  startMs: number;
  durationMs: 1000;
  frames: number;
  sampleRate: number;
  method: 'MONOPHONIC_TRACK_EXPERIMENTAL';
  motion: keyof typeof motionLabels;
  coverage: number;
  deltaCents: number | null;
  minConfidence: number | null;
  rmsDbfs: number;
  points: PitchTrackPoint[];
  warnings: TrackWarning[];
  oscillation: {
    rateHz: number;
    depthCents: number;
    cycles: number;
    fit: number;
  } | null;
};
const isWarning = (value: unknown): value is TrackWarning =>
  typeof value === 'string' && Object.hasOwn(trackWarningLabels, value);
const invalid = (): never => {
  throw new Error('PITCH_TRACK_ANALYSIS_INVALID');
};
function medianThree(values: number[]): number {
  const center = values.slice(0, 3).sort((a, b) => a - b)[1];
  return center === undefined ? invalid() : center;
}
export function decodeRecordedPitchTrack(
  value: unknown,
  take: RecordedTake,
  requestedStartMs: number,
): RecordedPitchTrack {
  if (
    pitchAnalysisErrorCode(take, requestedStartMs, 1000) ||
    !isRecord(value) ||
    Object.keys(value).length !== (value.schemaVersion === 2 ? 16 : 15) ||
    (value.schemaVersion !== 1 && value.schemaVersion !== 2) ||
    (value.schemaVersion === 1 && value.motion === 'OSCILLATING') ||
    value.projectId !== take.projectId ||
    value.takeId !== take.id ||
    value.sampleRate !== take.sampleRate ||
    value.frames !== take.sampleRate ||
    value.durationMs !== 1000 ||
    value.method !== 'MONOPHONIC_TRACK_EXPERIMENTAL' ||
    typeof value.motion !== 'string' ||
    !Object.hasOwn(motionLabels, value.motion) ||
    !isNumberWithin(value.startMs, 0, MAX_RECORDED_ANALYSIS_START_MS) ||
    Math.abs(
      value.startMs -
        (Math.floor((requestedStartMs * take.sampleRate) / 1000) * 1000) /
          take.sampleRate,
    ) > 1e-6 ||
    !isNumberWithin(value.coverage, 0, 1) ||
    !isNumberWithin(value.rmsDbfs, -120, 120) ||
    !(
      value.deltaCents === null || isNumberWithin(value.deltaCents, -4900, 4900)
    ) ||
    !(
      value.minConfidence === null ||
      isNumberWithin(value.minConfidence, 0.9, 1)
    ) ||
    !Array.isArray(value.points) ||
    value.points.length > 40 ||
    !Array.isArray(value.warnings) ||
    value.warnings.length > 7
  )
    return invalid();
  const decimation = Math.ceil(take.sampleRate / 16000),
    rate = take.sampleRate / decimation;
  const hop = Math.floor(rate * 0.025);
  const expectedCount =
    Math.floor((Math.floor(take.sampleRate / decimation) - 1024) / hop) + 1;
  const points = value.points.map((point: unknown, index): PitchTrackPoint => {
    const time =
      (((index * hop + 511.5) * decimation + (decimation - 1) / 2) * 1000) /
      take.sampleRate;
    if (
      !isRecord(point) ||
      Object.keys(point).length !== 3 ||
      !isNumberWithin(point.timeMs, 0, 1000) ||
      Math.abs(point.timeMs - time) > 1e-6
    )
      return invalid();
    if (point.pitchMidi === null && point.confidence === null)
      return { timeMs: point.timeMs, pitchMidi: null, confidence: null };
    if (
      !isNumberWithin(point.pitchMidi, 39.5, 88.5) ||
      !isNumberWithin(point.confidence, 0.9, 1)
    )
      return invalid();
    return {
      timeMs: point.timeMs,
      pitchMidi: point.pitchMidi,
      confidence: point.confidence,
    };
  });
  const warnings = value.warnings.map((warning: unknown): TrackWarning => {
    return isWarning(warning) ? warning : invalid();
  });
  if (
    !warnings.includes('EXPERIMENTAL') ||
    !warnings.includes('MONOPHONIC_ONLY') ||
    !warnings.includes('NOT_TECHNIQUE_CLASSIFICATION') ||
    new Set(warnings).size !== warnings.length
  )
    return invalid();
  const pitches = points.flatMap((p) =>
    p.pitchMidi === null ? [] : [p.pitchMidi],
  );
  const coverage = points.length ? pitches.length / points.length : 0;
  const minimum = points.reduce<number | null>(
    (min, p) =>
      p.confidence === null ? min : Math.min(min ?? 1, p.confidence),
    null,
  );
  const enough = coverage >= 0.8 && pitches.length >= 6;
  const delta = enough
    ? (medianThree([...pitches].reverse()) - medianThree(pitches)) * 100
    : null;
  let oscillation: RecordedPitchTrack['oscillation'] = null;
  if (value.schemaVersion === 2 && value.oscillation !== null) {
    const candidate = value.oscillation;
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).length !== 4 ||
      !isNumberWithin(candidate.rateHz, 3, 9) ||
      Math.abs(candidate.rateHz * 10 - Math.round(candidate.rateHz * 10)) >
        1e-6 ||
      !isNumberWithin(candidate.depthCents, 35, 150) ||
      !isNumberWithin(candidate.cycles, 3, 9) ||
      !isNumberWithin(candidate.fit, 0.85, 1)
    )
      return invalid();
    const times = points.flatMap((p) =>
      p.pitchMidi === null ? [] : [p.timeMs],
    );
    const first = times[0],
      last = times.at(-1);
    if (
      first === undefined ||
      last === undefined ||
      coverage < 0.9 ||
      pitches.length < 20 ||
      minimum === null ||
      minimum < 0.95 ||
      delta === null ||
      Math.abs(candidate.cycles - ((last - first) * candidate.rateHz) / 1000) >
        1e-6 ||
      times.some(
        (time, index) =>
          index > 0 && time - (times[index - 1] ?? time) > 80.001,
      ) ||
      pitches.some(
        (pitch, index) =>
          index > 0 && Math.abs(pitch - (pitches[index - 1] ?? pitch)) > 0.8,
      )
    )
      return invalid();
    const meanTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const meanPitch =
      pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length;
    const timePower = times.reduce(
      (sum, time) => sum + (time - meanTime) ** 2,
      0,
    );
    const covariance = times.reduce(
      (sum, time, index) =>
        sum + (time - meanTime) * ((pitches[index] ?? meanPitch) - meanPitch),
      0,
    );
    if (
      timePower <= 0 ||
      Math.abs(covariance / timePower) * (last - first) * 100 > 50 ||
      Math.max(...pitches) - Math.min(...pitches) <= 0.35
    )
      return invalid();
    oscillation = {
      rateHz: candidate.rateHz,
      depthCents: candidate.depthCents,
      cycles: candidate.cycles,
      fit: candidate.fit,
    };
  }
  if ((value.motion === 'OSCILLATING') !== (oscillation !== null))
    return invalid();
  if (
    Math.abs(value.coverage - coverage) > 1e-6 ||
    (minimum === null
      ? value.minConfidence !== null
      : value.minConfidence === null ||
        Math.abs(value.minConfidence - minimum) > 1e-9) ||
    (delta === null
      ? value.deltaCents !== null
      : value.deltaCents === null ||
        Math.abs(value.deltaCents - delta) > 1e-6) ||
    (points.length
      ? points.length !== expectedCount
      : !warnings.includes('CLIPPED') && !warnings.includes('LOW_LEVEL')) ||
    ((warnings.includes('CLIPPED') || warnings.includes('LOW_LEVEL')) &&
      points.length !== 0) ||
    (points.length > 0 && !enough && !warnings.includes('LOW_COVERAGE')) ||
    (enough &&
      value.motion === 'UNVERIFIED' &&
      !warnings.includes('NON_MONOTONIC_OR_AMBIGUOUS')) ||
    (warnings.includes('LOW_LEVEL') && value.rmsDbfs >= -65) ||
    (value.motion !== 'UNVERIFIED' && (!enough || delta === null)) ||
    (value.motion === 'RISING' &&
      (delta === null || delta < 75 || delta > 1200)) ||
    (value.motion === 'FALLING' &&
      (delta === null || delta > -75 || delta < -1200)) ||
    (value.motion === 'STEADY' &&
      Math.max(...pitches) - Math.min(...pitches) > 0.35)
  )
    return invalid();
  const motion = value.motion;
  if (
    motion !== 'STEADY' &&
    motion !== 'RISING' &&
    motion !== 'FALLING' &&
    motion !== 'OSCILLATING' &&
    motion !== 'UNVERIFIED'
  )
    return invalid();
  return {
    schemaVersion: value.schemaVersion,
    projectId: take.projectId,
    takeId: take.id,
    startMs: value.startMs,
    durationMs: 1000,
    frames: take.sampleRate,
    sampleRate: take.sampleRate,
    method: 'MONOPHONIC_TRACK_EXPERIMENTAL',
    motion,
    coverage: value.coverage,
    deltaCents: value.deltaCents,
    minConfidence: value.minConfidence,
    rmsDbfs: value.rmsDbfs,
    points,
    warnings,
    oscillation,
  };
}
export const recordedPitchTrackApi = {
  available: isTauri,
  async analyze(
    take: RecordedTake,
    startMs: number,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    if (!isUuid(take.projectId) || !isUuid(take.id)) return invalid();
    const reason = pitchAnalysisErrorCode(take, startMs, 1000);
    if (reason) throw new Error(reason);
    const value = await runStorageJob(
      'analyze_recording_pitch_track',
      { projectId: take.projectId, takeId: take.id, startMs },
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (signal.aborted) throw new DOMException('분석 취소', 'AbortError');
    return decodeRecordedPitchTrack(value, take, startMs);
  },
};
