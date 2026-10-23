import { invoke } from '@tauri-apps/api/core';
import { isRecord, isSafeUnsigned } from '../../shared/validation';
import { isUuid } from '../library/projects';
import {
  decodeAttempt,
  decodePracticeEvent,
  type AttemptSnapshot,
  type PracticeEvent,
} from './practice';
export type StoredAttempt = {
  schemaVersion: 1;
  projectId: string;
  sessionId: string;
  attemptId: string;
  revisionId: string;
  trackId: string;
  scoringVersion: string;
  configFingerprint: string;
  state: 'RUNNING' | 'FINISHED' | 'STOPPED' | 'INVALIDATED' | 'INTERRUPTED';
  startedAtMs: number;
  endedAtMs: number | null;
  completedOrder: number | null;
  snapshot: AttemptSnapshot;
};
export type StoredEvent = {
  sequence: number;
  measureIndex: number;
  event: PracticeEvent;
};
export type MeasureResult = {
  measureIndex: number;
  cool: number;
  good: number;
  miss: number;
  excluded: number;
  accuracy: number | null;
};
export function decodeRecord(value: unknown): StoredAttempt {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isUuid(value.projectId) ||
    !isUuid(value.sessionId) ||
    !isUuid(value.attemptId) ||
    !isUuid(value.revisionId) ||
    typeof value.trackId !== 'string' ||
    !value.trackId ||
    value.trackId.length > 128 ||
    typeof value.scoringVersion !== 'string' ||
    value.scoringVersion.length > 128 ||
    typeof value.configFingerprint !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.configFingerprint) ||
    !isSafeUnsigned(value.startedAtMs) ||
    (value.endedAtMs !== null && !isSafeUnsigned(value.endedAtMs)) ||
    (value.completedOrder !== null &&
      (!isSafeUnsigned(value.completedOrder) || value.completedOrder === 0))
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  const state = value.state;
  if (
    state !== 'RUNNING' &&
    state !== 'FINISHED' &&
    state !== 'STOPPED' &&
    state !== 'INVALIDATED' &&
    state !== 'INTERRUPTED'
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  const snapshot = decodeAttempt(value.snapshot);
  if (
    snapshot.attemptId !== value.attemptId ||
    snapshot.scoreRevision !== value.revisionId ||
    snapshot.trackId !== value.trackId ||
    (state !== 'INTERRUPTED' && snapshot.state !== state) ||
    (state === 'INTERRUPTED' && snapshot.state !== 'RUNNING') ||
    (state === 'FINISHED'
      ? value.completedOrder === null
      : value.completedOrder !== null) ||
    (state === 'RUNNING' ? value.endedAtMs !== null : value.endedAtMs === null)
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    projectId: value.projectId,
    sessionId: value.sessionId,
    attemptId: value.attemptId,
    revisionId: value.revisionId,
    trackId: value.trackId,
    scoringVersion: value.scoringVersion,
    configFingerprint: value.configFingerprint,
    state,
    startedAtMs: value.startedAtMs,
    endedAtMs: value.endedAtMs,
    completedOrder: value.completedOrder,
    snapshot,
  };
}
export function decodeStoredEvent(v: unknown): StoredEvent {
  if (
    !isRecord(v) ||
    !isSafeUnsigned(v.sequence) ||
    v.sequence === 0 ||
    !isSafeUnsigned(v.measureIndex, 100000)
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  const event = decodePracticeEvent(v.event);
  if (event.sequence !== v.sequence)
    throw new Error('PROJECT_CONTRACT_INVALID');
  return { sequence: v.sequence, measureIndex: v.measureIndex, event };
}
function abort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('기록 조회 취소', 'AbortError');
}
export const recordApi = {
  async list(projectId: string, signal: AbortSignal) {
    abort(signal);
    const v = await invoke<unknown>('list_practice_records', {
      request: { schemaVersion: 1, projectId },
    });
    abort(signal);
    if (!isRecord(v) || v.schemaVersion !== 1 || !Array.isArray(v.attempts))
      throw new Error('PROJECT_CONTRACT_INVALID');
    const records = v.attempts.map(decodeRecord);
    if (
      records.some((r) => r.projectId !== projectId) ||
      new Set(records.map((r) => r.attemptId)).size !== records.length
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    return records;
  },
  async events(
    record: StoredAttempt,
    signal: AbortSignal,
    progress: (count: number, total: number) => void,
  ) {
    const events: StoredEvent[] = [];
    const total = record.snapshot.eventSequence;
    while (events.length < total) {
      abort(signal);
      const v = await invoke<unknown>('list_practice_events', {
        request: {
          schemaVersion: 1,
          projectId: record.projectId,
          attemptId: record.attemptId,
          afterSequence: events.length,
          throughSequence: total,
        },
      });
      abort(signal);
      if (
        !isRecord(v) ||
        v.schemaVersion !== 1 ||
        !Array.isArray(v.events) ||
        v.events.length === 0 ||
        v.events.length > 500
      )
        throw new Error('ARCHIVE_EVENT_GAP');
      const page = v.events.map(decodeStoredEvent);
      if (
        page.some(
          (e, i) =>
            e.sequence !== events.length + i + 1 ||
            e.sequence > total ||
            (e.event.finalOutcome !== null &&
              e.event.finalOutcome.playbackEpoch !==
                record.snapshot.playbackEpoch),
        )
      )
        throw new Error('ARCHIVE_EVENT_GAP');
      events.push(...page);
      progress(events.length, total);
    }
    const finalized = new Set<string>();
    let cool = 0,
      good = 0,
      miss = 0,
      excluded = 0,
      score = 0;
    for (const { event } of events) {
      const final = event.finalOutcome;
      if (!final) continue;
      if (finalized.has(final.noteId))
        throw new Error('PROJECT_CONTRACT_INVALID');
      finalized.add(final.noteId);
      score += final.outcome.scoreAwarded;
      if (final.outcome.kind === 'NOT_SCORED') excluded++;
      else if (final.outcome.judgement === 'COOL') cool++;
      else if (final.outcome.judgement === 'GOOD') good++;
      else miss++;
    }
    if (
      cool !== record.snapshot.cool ||
      good !== record.snapshot.good ||
      miss !== record.snapshot.miss ||
      excluded !== record.snapshot.excluded ||
      score !== record.snapshot.score
    )
      throw new Error('ARCHIVE_EVENT_GAP');
    return events;
  },
};
export function measureResults(events: StoredEvent[]): MeasureResult[] {
  const measures = new Map<number, MeasureResult>();
  for (const { measureIndex, event } of events) {
    const final = event.finalOutcome;
    if (!final) continue;
    const measure = measures.get(measureIndex) ?? {
      measureIndex,
      cool: 0,
      good: 0,
      miss: 0,
      excluded: 0,
      accuracy: null,
    };
    const outcome = final.outcome;
    if (outcome.kind === 'NOT_SCORED') measure.excluded++;
    else if (outcome.judgement === 'COOL') measure.cool++;
    else if (outcome.judgement === 'GOOD') measure.good++;
    else measure.miss++;
    const count = measure.cool + measure.good + measure.miss;
    measure.accuracy =
      count > 0 ? (100 * (measure.cool + measure.good * 0.5)) / count : null;
    measures.set(measureIndex, measure);
  }
  return [...measures.values()].sort((a, b) => a.measureIndex - b.measureIndex);
}
export function timingHistogram(events: StoredEvent[]) {
  const labels = [
    '−100 ms 미만',
    '−100 ~ −50 ms',
    '−50 ~ 0 ms',
    '0 ~ 50 ms',
    '50 ~ 100 ms',
    '100 ms 이상',
  ];
  const counts = labels.map((label) => ({ label, count: 0 }));
  for (const { event } of events) {
    const f = event.finalOutcome;
    if (
      !f ||
      f.outcome.kind !== 'JUDGED' ||
      f.outcome.judgement === 'MISS' ||
      f.deltaRealMs === null
    )
      continue;
    const index =
      f.deltaRealMs < -100
        ? 0
        : f.deltaRealMs < -50
          ? 1
          : f.deltaRealMs < 0
            ? 2
            : f.deltaRealMs < 50
              ? 3
              : f.deltaRealMs < 100
                ? 4
                : 5;
    const bin = counts[index];
    if (bin) bin.count++;
  }
  return counts;
}
function comparableRecords(records: StoredAttempt[], selected: StoredAttempt) {
  return records.filter(
    (r) =>
      r.state === 'FINISHED' &&
      r.completedOrder !== null &&
      r.configFingerprint === selected.configFingerprint &&
      r.revisionId === selected.revisionId &&
      r.trackId === selected.trackId &&
      r.snapshot.cool + r.snapshot.good + r.snapshot.miss > 0,
  );
}
export function bestComparable(
  records: StoredAttempt[],
  selected: StoredAttempt,
) {
  return (
    comparableRecords(records, selected).sort(
      (a, b) =>
        b.snapshot.score - a.snapshot.score ||
        (a.completedOrder ?? 0) - (b.completedOrder ?? 0),
    )[0] ?? null
  );
}
export function previousComparable(
  records: StoredAttempt[],
  selected: StoredAttempt,
) {
  if (
    selected.state !== 'FINISHED' ||
    selected.completedOrder === null ||
    selected.snapshot.cool + selected.snapshot.good + selected.snapshot.miss ===
      0
  )
    return null;
  const order = selected.completedOrder;
  return (
    comparableRecords(records, selected)
      .filter((r) => r.completedOrder !== null && r.completedOrder < order)
      .sort((a, b) => (b.completedOrder ?? 0) - (a.completedOrder ?? 0))[0] ??
    null
  );
}
