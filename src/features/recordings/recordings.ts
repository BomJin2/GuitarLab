import { invoke } from '@tauri-apps/api/core';
import {
  isRecord,
  isNumberWithin,
  isSafeUnsigned,
} from '../../shared/validation';
import {
  decodeProfiles,
  type DeviceProfile,
  type MonitorEnvironment,
} from '../settings/calibration';
import {
  isUuid,
  runStorageJob,
  decodeRevision,
  type JobSnapshot,
} from '../library/projects';
export type RecordingState =
  | 'ARMING'
  | 'RECORDING'
  | 'FINALIZING'
  | 'READY'
  | 'RECOVERABLE_ERROR'
  | 'CANCELLED';
export type RecordingTransport = {
  playbackEpoch: number;
  rate: number;
  backingAssetId: string;
};
export type RecordedTake = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  scoreRevisionId: string;
  targetScoreTrackId: string;
  name: string;
  memo: string;
  createdAtMs: number;
  origin: 'USER_INPUT';
  source: 'INPUT_ONLY';
  state: RecordingState;
  sampleRate: number;
  channels: 1;
  frames: number;
  peak: number;
  droppedFrames: number;
  warningIntervals: {
    frameStart: number;
    missingFrames: number;
    errorCode: string;
  }[];
  errorCode: string | null;
  captureStartSampleIndex: string | null;
  captureStartMonotonicNs: string | null;
  streamGeneration: number;
  calibrationRevision: number;
  calibration: DeviceProfile;
  transport: RecordingTransport | null;
  songStartMs: number | null;
  alignmentOffsetMs: number;
  recoveredFrom: string | null;
  sha256: string | null;
  referenceTakeIds?: string[];
};
export type StartRecordingRequest = {
  projectId: string;
  scoreRevisionId: string;
  targetScoreTrackId: string;
  expectedStreamGeneration: number;
  monitorEnvironment: MonitorEnvironment;
  source: 'INPUT_ONLY';
  transport: RecordingTransport | null;
  referenceTakeIds?: string[];
  deferTransport?: boolean;
};
const states: RecordingState[] = [
  'ARMING',
  'RECORDING',
  'FINALIZING',
  'READY',
  'RECOVERABLE_ERROR',
  'CANCELLED',
];
function decimal(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' &&
      /^\d{1,20}$/.test(value) &&
      BigInt(value) <= 18446744073709551615n)
  );
}
export function decodeTake(value: unknown): RecordedTake {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    (value.referenceTakeIds !== undefined &&
      (!Array.isArray(value.referenceTakeIds) ||
        value.referenceTakeIds.length > 7 ||
        !value.referenceTakeIds.every(isUuid) ||
        new Set(value.referenceTakeIds).size !==
          value.referenceTakeIds.length ||
        value.referenceTakeIds.some((id) => id === value.id))) ||
    !isUuid(value.id) ||
    !isUuid(value.projectId) ||
    !isUuid(value.scoreRevisionId) ||
    typeof value.targetScoreTrackId !== 'string' ||
    !value.targetScoreTrackId.length ||
    value.targetScoreTrackId.length > 128 ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    [...value.name].length > 200 ||
    typeof value.memo !== 'string' ||
    [...value.memo].length > 2000 ||
    !isSafeUnsigned(value.createdAtMs) ||
    value.origin !== 'USER_INPUT' ||
    value.source !== 'INPUT_ONLY' ||
    !states.some((state) => state === value.state) ||
    !isSafeUnsigned(value.sampleRate, 192000) ||
    value.sampleRate < 8000 ||
    value.channels !== 1 ||
    !isSafeUnsigned(
      value.frames,
      Math.min(
        value.sampleRate * 600,
        Math.floor((256 * 1024 * 1024 - 58) / 4),
      ),
    ) ||
    typeof value.peak !== 'number' ||
    !Number.isFinite(value.peak) ||
    value.peak < 0 ||
    !isSafeUnsigned(value.droppedFrames) ||
    !Array.isArray(value.warningIntervals) ||
    value.warningIntervals.length > 32 ||
    !value.warningIntervals.every(
      (w: unknown) =>
        isRecord(w) &&
        isSafeUnsigned(w.frameStart, Number(value.frames)) &&
        isSafeUnsigned(w.missingFrames) &&
        typeof w.errorCode === 'string' &&
        w.errorCode.length <= 100,
    ) ||
    !(
      value.errorCode === null ||
      (typeof value.errorCode === 'string' && value.errorCode.length <= 100)
    ) ||
    !decimal(value.captureStartSampleIndex) ||
    !decimal(value.captureStartMonotonicNs) ||
    (value.captureStartSampleIndex === null) !==
      (value.captureStartMonotonicNs === null) ||
    !isSafeUnsigned(value.streamGeneration) ||
    value.streamGeneration === 0 ||
    !isSafeUnsigned(value.calibrationRevision) ||
    !isNumberWithin(value.alignmentOffsetMs, -60000, 60000) ||
    !(value.recoveredFrom === null || isUuid(value.recoveredFrom)) ||
    !(
      value.sha256 === null ||
      (typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256))
    ) ||
    !(
      value.songStartMs === null ||
      isNumberWithin(value.songStartMs, -60000, 86401000)
    ) ||
    !(
      value.transport === null ||
      (isRecord(value.transport) &&
        isSafeUnsigned(value.transport.playbackEpoch) &&
        isNumberWithin(value.transport.rate, 0.5, 1.5) &&
        isUuid(value.transport.backingAssetId))
    ) ||
    (value.transport === null && value.songStartMs !== null) ||
    (value.state === 'READY' && (value.frames === 0 || value.sha256 === null))
  )
    throw new Error('RECORDING_CONTRACT_INVALID');
  const calibration = decodeProfiles({
    schemaVersion: 1,
    revision: value.calibrationRevision,
    profiles: [value.calibration],
  }).profiles[0];
  if (!calibration || calibration.key.sampleRate !== value.sampleRate)
    throw new Error('RECORDING_CONTRACT_INVALID');
  // 경계에서 검증한 구조를 유지하고 중첩 배열도 검증 후 반환합니다.
  return value as RecordedTake;
}
function envelope(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== 1)
    throw new Error('RECORDING_CONTRACT_INVALID');
  return value;
}
function snapshot(value: unknown) {
  const v = envelope(value);
  return v.take === null ? null : decodeTake(v.take);
}
export function recordingActive(take: RecordedTake | null) {
  return (
    take !== null && ['ARMING', 'RECORDING', 'FINALIZING'].includes(take.state)
  );
}
export const recordingApi = {
  async start(request: StartRecordingRequest) {
    return snapshot(
      await invoke<unknown>('start_recording', {
        request: { schemaVersion: 1, ...request },
      }),
    );
  },
  async status() {
    return snapshot(
      await invoke<unknown>('get_recording', { request: { schemaVersion: 1 } }),
    );
  },
  async stop(takeId: string) {
    return snapshot(
      await invoke<unknown>('stop_recording', {
        request: { schemaVersion: 1, takeId },
      }),
    );
  },
  async list(projectId: string) {
    const value = envelope(
      await invoke<unknown>('list_recordings', {
        request: { schemaVersion: 1, projectId },
      }),
    );
    if (!Array.isArray(value.takes) || value.takes.length > 1000)
      throw new Error('RECORDING_CONTRACT_INVALID');
    const takes = value.takes.map(decodeTake);
    if (
      takes.some((t) => t.projectId !== projectId) ||
      new Set(takes.map((t) => t.id)).size !== takes.length
    )
      throw new Error('RECORDING_CONTRACT_INVALID');
    return takes;
  },
  async read(
    projectId: string,
    takeId: string,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    let jobId = '';
    const value = envelope(
      await runStorageJob(
        'read_recording',
        { projectId, takeId },
        signal,
        (job) => {
          jobId = job.jobId;
          progress(job);
        },
      ),
    );
    if (
      value.projectId !== projectId ||
      value.takeId !== takeId ||
      !isSafeUnsigned(value.bytes, 256 * 1024 * 1024) ||
      value.bytes <= 58
    )
      throw new Error('RECORDING_CONTRACT_INVALID');
    const data = await invoke<unknown>('take_storage_bytes', {
      request: { schemaVersion: 1, jobId },
    });
    if (!(data instanceof ArrayBuffer) || data.byteLength !== value.bytes)
      throw new Error('RECORDING_CONTRACT_INVALID');
    return data;
  },
  async revision(projectId: string, takeId: string) {
    const value = envelope(
      await invoke<unknown>('get_recording_revision', {
        request: { schemaVersion: 1, projectId, takeId },
      }),
    );
    const revision = decodeRevision(value.revision);
    if (revision.projectId !== projectId)
      throw new Error('RECORDING_CONTRACT_INVALID');
    return revision;
  },
  async recover(
    projectId: string,
    takeId: string,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    const value = envelope(
      await runStorageJob(
        'recover_recording',
        { projectId, takeId },
        signal,
        progress,
        { waitForCancellation: true },
      ),
    );
    const take = decodeTake(value.take);
    if (take.projectId !== projectId || take.recoveredFrom !== takeId)
      throw new Error('RECORDING_CONTRACT_INVALID');
    return take;
  },
  async update(
    take: RecordedTake,
    name: string,
    memo: string,
    alignmentOffsetMs: number,
  ) {
    const result = decodeTake(
      await invoke<unknown>('update_recording', {
        request: {
          schemaVersion: 1,
          projectId: take.projectId,
          takeId: take.id,
          name,
          memo,
          alignmentOffsetMs,
        },
      }),
    );
    if (result.id !== take.id || result.projectId !== take.projectId)
      throw new Error('RECORDING_CONTRACT_INVALID');
    return result;
  },
};
export function recordedSampleToSongMs(take: RecordedTake, frame: number) {
  if (
    !Number.isFinite(frame) ||
    frame < 0 ||
    frame > take.frames ||
    take.songStartMs === null ||
    take.transport === null
  )
    return null;
  return (
    take.songStartMs +
    (frame / take.sampleRate) * 1000 * take.transport.rate +
    take.alignmentOffsetMs
  );
}
export function comparisonWarnings(a: RecordedTake, b: RecordedTake) {
  const warnings: string[] = [];
  if (a.scoreRevisionId !== b.scoreRevisionId)
    warnings.push('악보 리비전이 다릅니다');
  if (a.targetScoreTrackId !== b.targetScoreTrackId)
    warnings.push('목표 트랙이 다릅니다');
  if (a.transport?.rate !== b.transport?.rate)
    warnings.push('녹음 배속이 다릅니다');
  if (a.transport?.backingAssetId !== b.transport?.backingAssetId)
    warnings.push('반주 소스가 다릅니다');
  if (a.alignmentOffsetMs !== b.alignmentOffsetMs)
    warnings.push('수동 정렬 오프셋이 다릅니다');
  if (JSON.stringify(a.calibration) !== JSON.stringify(b.calibration))
    warnings.push('입력 보정 조건이 다릅니다');
  if (a.songStartMs === null || b.songStartMs === null)
    warnings.push('무반주 녹음은 악보 시간에 정렬되지 않았습니다');
  return warnings;
}
export function recordingError(cause: unknown) {
  const received =
    isRecord(cause) && typeof cause.code === 'string'
      ? cause.code
      : cause instanceof Error
        ? cause.message
        : 'RECORDING_ERROR';
  const code = /^[A-Z0-9_]{1,100}$/.test(received)
    ? received
    : 'RECORDING_ERROR';
  const messages: Record<string, string> = {
    CALIBRATION_REQUIRED:
      '현재 입력과 모니터 환경의 보정값을 환경 설정에서 저장하세요.',
    CLOCK_UNCERTAIN:
      '반주 시간 동기화를 연결하지 못했습니다. 입력과 음원을 확인하고 다시 시도하세요.',
    RECORDING_PREPARATION_CANCELED:
      '녹음 준비를 취소했습니다. 이미 기록을 시작했다면 보존된 테이크 상태를 확인하세요.',
    RECORDING_PLAYBACK_FAILED:
      '반주를 시작하지 못해 녹음을 중단했습니다. 테이크 상태를 확인하세요.',
    DISK_SPACE_LOW: '최대 녹음 길이를 저장할 디스크 여유가 부족합니다.',
    RECORDING_BUSY: '진행 중인 녹음 STOP과 저장을 먼저 마치세요.',
    WAV_INVALID:
      '녹음 파일이 손상되었거나 형식이 맞지 않습니다. 원본을 보존했습니다.',
    RECORDING_CONTRACT_INVALID: '녹음 응답 형식이 맞지 않습니다.',
    TAKE_CHANGED: '다른 테이크가 선택되어 중지를 거부했습니다.',
    INPUT_NOT_ACTIVE: '정상 기타 입력을 먼저 시작하세요.',
  };
  return (
    messages[code] ??
    `녹음 작업을 완료하지 못했습니다 (${code}). 원본은 보존됩니다.`
  );
}
