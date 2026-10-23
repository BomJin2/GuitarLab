import { invoke } from '@tauri-apps/api/core';
import type { ScoreDocument } from '../../entities/score';
import type { PlaybackLoop } from '../player/PlayerEngine';
import { scoreTickToAudioTime } from '../player/sync';
import {
  decodeProfiles,
  type DeviceProfile,
  type MonitorEnvironment,
} from '../settings/calibration';
import {
  isRecord,
  isNumberWithin,
  isSafeUnsigned,
} from '../../shared/validation';

export type PracticeTarget = {
  unsupported?: boolean;
  id: string;
  songTimeMs: number;
  pitchMidi: number;
};
export type JudgementSettings = {
  coolMs: number;
  goodMs: number;
  pitchToleranceCents: number;
};
export const difficultySettings: Record<
  'Easy' | 'Normal' | 'Hard',
  JudgementSettings
> = {
  Easy: { coolMs: 80, goodMs: 180, pitchToleranceCents: 75 },
  Normal: { coolMs: 50, goodMs: 120, pitchToleranceCents: 50 },
  Hard: { coolMs: 30, goodMs: 80, pitchToleranceCents: 35 },
};
export type FinalOutcome = {
  noteId: string;
  playbackEpoch: number;
  deltaRealMs: number | null;
  detectedPitchMidi: number | null;
  comboAfter: number;
  outcome:
    | {
        kind: 'JUDGED';
        judgement: 'COOL' | 'GOOD' | 'MISS';
        detail: 'ON_TIME' | 'EARLY' | 'LATE' | 'WRONG_NOTE';
        scoreAwarded: number;
      }
    | {
        kind: 'NOT_SCORED';
        reason: 'SKIPPED' | 'UNSUPPORTED' | 'UNVERIFIED';
        scoreAwarded: 0;
      };
};
export type PracticeEvent = {
  sequence: number;
  noteId: string;
  expectedPitchMidi: number;
  confidence: number | null;
  finalOutcome: FinalOutcome | null;
  feedback: 'WRONG_NOTE' | null;
};
export type AttemptSnapshot = JudgementSettings & {
  schemaVersion: 1;
  attemptId: string;
  state: 'RUNNING' | 'FINISHED' | 'STOPPED' | 'INVALIDATED';
  errorCode: string | null;
  playbackEpoch: number;
  scoreRevision: string;
  trackId: string;
  rate: number;
  calibrationRevision: number;
  calibrationProfile: DeviceProfile;
  score: number;
  combo: number;
  maxCombo: number;
  cool: number;
  good: number;
  miss: number;
  excluded: number;
  accuracy: number | null;
  targetCount: number;
  eventSequence: number;
  events: PracticeEvent[];
};
export type StartAttemptRequest = JudgementSettings & {
  schemaVersion: 1;
  expectedStreamGeneration: number;
  playbackEpoch: number;
  rate: number;
  scoreRevision: string;
  trackId: string;
  calibrationRevision: number;
  calibrationProfileId: string;
  monitorEnvironment: MonitorEnvironment;
  targets: PracticeTarget[];
  archive?: {
    projectId: string;
    sessionId: string;
    rangeStartMs: number;
    rangeEndMs: number;
  };
};
function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)
  );
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}
export function validJudgementSettings(value: JudgementSettings) {
  return (
    isNumberWithin(value.coolMs, 5, 250) &&
    isNumberWithin(value.goodMs, value.coolMs, 500) &&
    isNumberWithin(value.pitchToleranceCents, 10, 100)
  );
}
function finalOutcome(value: unknown): value is FinalOutcome {
  if (
    !isRecord(value) ||
    !identifier(value.noteId) ||
    !isSafeUnsigned(value.playbackEpoch) ||
    !(
      value.deltaRealMs === null || isNumberWithin(value.deltaRealMs, -500, 500)
    ) ||
    !(
      value.detectedPitchMidi === null ||
      isNumberWithin(value.detectedPitchMidi, 0, 127)
    ) ||
    !isSafeUnsigned(value.comboAfter, 100000) ||
    !isRecord(value.outcome)
  )
    return false;
  const outcome = value.outcome;
  return (
    (outcome.kind === 'JUDGED' &&
      typeof outcome.judgement === 'string' &&
      ['COOL', 'GOOD', 'MISS'].includes(outcome.judgement) &&
      typeof outcome.detail === 'string' &&
      ['ON_TIME', 'EARLY', 'LATE', 'WRONG_NOTE'].includes(outcome.detail) &&
      outcome.scoreAwarded ===
        (outcome.judgement === 'COOL'
          ? 1000
          : outcome.judgement === 'GOOD'
            ? 500
            : 0)) ||
    (outcome.kind === 'NOT_SCORED' &&
      typeof outcome.reason === 'string' &&
      ['SKIPPED', 'UNSUPPORTED', 'UNVERIFIED'].includes(outcome.reason) &&
      outcome.scoreAwarded === 0)
  );
}
function practiceEvent(value: unknown): value is PracticeEvent {
  return (
    isRecord(value) &&
    isSafeUnsigned(value.sequence) &&
    value.sequence > 0 &&
    identifier(value.noteId) &&
    isSafeUnsigned(value.expectedPitchMidi, 127) &&
    (value.confidence === null || isNumberWithin(value.confidence, 0, 1)) &&
    ((value.feedback === null &&
      finalOutcome(value.finalOutcome) &&
      value.noteId === value.finalOutcome.noteId) ||
      (value.feedback === 'WRONG_NOTE' && value.finalOutcome === null))
  );
}
export function decodePracticeEvent(value: unknown): PracticeEvent {
  if (!practiceEvent(value)) throw new Error('PRACTICE_CONTRACT_INVALID');
  return value;
}
export function decodeAttempt(value: unknown): AttemptSnapshot {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !uuid(value.attemptId) ||
    !['RUNNING', 'FINISHED', 'STOPPED', 'INVALIDATED'].includes(
      String(value.state),
    ) ||
    !(
      value.errorCode === null ||
      (typeof value.errorCode === 'string' &&
        /^[A-Z_]{1,64}$/.test(value.errorCode))
    ) ||
    !isSafeUnsigned(value.playbackEpoch) ||
    value.playbackEpoch === 0 ||
    !uuid(value.scoreRevision) ||
    !identifier(value.trackId) ||
    !isNumberWithin(value.rate, 0.5, 1.5) ||
    !isSafeUnsigned(value.calibrationRevision) ||
    !isNumberWithin(value.coolMs, 5, 250) ||
    !isNumberWithin(value.goodMs, value.coolMs, 500) ||
    !isNumberWithin(value.pitchToleranceCents, 10, 100) ||
    !isSafeUnsigned(value.score, 100000000) ||
    !isSafeUnsigned(value.combo, 100000) ||
    !isSafeUnsigned(value.maxCombo, 100000) ||
    value.combo > value.maxCombo ||
    !isSafeUnsigned(value.cool, 100000) ||
    !isSafeUnsigned(value.good, 100000) ||
    !isSafeUnsigned(value.miss, 100000) ||
    !isSafeUnsigned(value.excluded, 100000) ||
    !isSafeUnsigned(value.targetCount, 100000) ||
    value.targetCount === 0 ||
    value.cool + value.good + value.miss + value.excluded > value.targetCount ||
    value.score !== value.cool * 1000 + value.good * 500 ||
    !(value.accuracy === null || isNumberWithin(value.accuracy, 0, 100)) ||
    !isSafeUnsigned(value.eventSequence) ||
    !Array.isArray(value.events) ||
    value.events.length > 128 ||
    !value.events.every(practiceEvent)
  )
    throw new Error('PRACTICE_CONTRACT_INVALID');
  const calibrationProfile = decodeProfiles({
    schemaVersion: 1,
    revision: value.calibrationRevision,
    profiles: [value.calibrationProfile],
  }).profiles[0];
  const events = value.events;
  const eventSequence = value.eventSequence;
  const judged = value.cool + value.good + value.miss;
  const accuracy = judged
    ? (100 * (value.cool + value.good * 0.5)) / judged
    : null;
  if (
    !calibrationProfile ||
    (accuracy === null
      ? value.accuracy !== null
      : value.accuracy === null ||
        Math.abs(value.accuracy - accuracy) > 0.000001) ||
    (value.state !== 'RUNNING' &&
      value.cool + value.good + value.miss + value.excluded !==
        value.targetCount) ||
    (events.length > 0 && events.at(-1)?.sequence !== eventSequence) ||
    events.some(
      (event, index) =>
        event.sequence > eventSequence ||
        (index > 0 &&
          event.sequence !== (events[index - 1]?.sequence ?? -1) + 1) ||
        (event.finalOutcome !== null &&
          event.finalOutcome.playbackEpoch !== value.playbackEpoch),
    )
  )
    throw new Error('PRACTICE_CONTRACT_INVALID');
  const state = value.state;
  if (
    state !== 'RUNNING' &&
    state !== 'FINISHED' &&
    state !== 'STOPPED' &&
    state !== 'INVALIDATED'
  )
    throw new Error('PRACTICE_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    attemptId: value.attemptId,
    state,
    errorCode: value.errorCode,
    playbackEpoch: value.playbackEpoch,
    scoreRevision: value.scoreRevision,
    trackId: value.trackId,
    rate: value.rate,
    calibrationRevision: value.calibrationRevision,
    calibrationProfile,
    coolMs: value.coolMs,
    goodMs: value.goodMs,
    pitchToleranceCents: value.pitchToleranceCents,
    score: value.score,
    combo: value.combo,
    maxCombo: value.maxCombo,
    cool: value.cool,
    good: value.good,
    miss: value.miss,
    excluded: value.excluded,
    accuracy: value.accuracy,
    targetCount: value.targetCount,
    eventSequence: value.eventSequence,
    events: value.events,
  };
}
export function buildPracticeTargets(
  document: ScoreDocument,
  trackIndex: number,
  durationMs: number,
  loop: PlaybackLoop | null,
): PracticeTarget[] {
  const track = document.tracks[trackIndex];
  if (!track || !isNumberWithin(durationMs, 0, 86400000))
    throw new Error('INVALID_TARGETS');
  const targets = track.notes
    .filter((note) => note.attack !== false)
    .map((note) => ({
      id: note.id,
      pitchMidi: note.pitchMidi,
      ...(note.judgementSupport === 'UNSUPPORTED' ? { unsupported: true } : {}),
      songTimeMs: scoreTickToAudioTime(document.syncAnchors, note.startTick),
    }))
    .filter(
      (target) =>
        target.songTimeMs >= (loop?.startMs ?? 0) &&
        target.songTimeMs < (loop?.endMs ?? durationMs),
    )
    .sort(
      (left, right) =>
        left.songTimeMs - right.songTimeMs || left.id.localeCompare(right.id),
    );
  if (
    targets.length > 100000 ||
    targets.some(
      (target) =>
        !identifier(target.id) ||
        !isSafeUnsigned(target.pitchMidi, 127) ||
        !isNumberWithin(target.songTimeMs, 0, 86400000),
    ) ||
    new Set(targets.map((target) => target.id)).size !== targets.length
  )
    throw new Error('INVALID_TARGETS');
  return targets;
}
export const practiceApi = {
  async start(request: StartAttemptRequest) {
    return decodeAttempt(
      await invoke<unknown>('start_practice_attempt', { request }),
    );
  },
  async poll(attemptId: string) {
    return decodeAttempt(
      await invoke<unknown>('get_practice_attempt', {
        request: { schemaVersion: 1, attemptId },
      }),
    );
  },
  async stop(attemptId: string) {
    return decodeAttempt(
      await invoke<unknown>('stop_practice_attempt', {
        request: { schemaVersion: 1, attemptId },
      }),
    );
  },
};
export function practiceError(cause: unknown) {
  const code = isRecord(cause)
    ? cause.code
    : cause instanceof Error
      ? cause.message
      : '';
  if (code === 'CLOCK_UNCERTAIN')
    return '시간 동기화를 기다립니다. 남은 음표는 감점에서 제외합니다.';
  if (code === 'REVISION_CONFLICT')
    return '보정값이 변경되었습니다. 환경 설정에서 보정값을 다시 읽으세요.';
  if (code === 'CALIBRATION_REQUIRED')
    return '현재 입력·모니터 환경의 보정값을 먼저 저장하세요.';
  if (
    [
      'INPUT_GAP',
      'INPUT_STALLED',
      'INPUT_CHANGED',
      'INPUT_NOT_ACTIVE',
    ].includes(String(code))
  )
    return '입력 누락 또는 장치 변경으로 시도를 종료했습니다. 입력을 확인하세요.';
  return '채점 상태를 확인하지 못했습니다. 채점을 중단한 뒤 다시 시작하세요.';
}
