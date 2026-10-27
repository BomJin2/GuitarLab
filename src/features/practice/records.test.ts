import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  bestComparable,
  decodeRecord,
  measureResults,
  recordApi,
  timingHistogram,
  previousComparable,
  type StoredEvent,
} from './records';
import { recordFixture } from '../../test/projectFixture';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
beforeEach(() => vi.clearAllMocks());
function events(): StoredEvent[] {
  return recordFixture().snapshot.events.map((event) => ({
    sequence: event.sequence,
    measureIndex: 0,
    event,
  }));
}
it('미완료·조건 다른 기록은 최고점에서 제외하고 동점은 먼저 완료한 기록을 유지한다', () => {
  const first = recordFixture();
  const late = {
    ...first,
    attemptId: '00000000-0000-4000-8000-000000000005',
    completedOrder: 2,
  };
  const changed = {
    ...first,
    configFingerprint: 'b'.repeat(64),
    snapshot: { ...first.snapshot, score: 9000 },
  };
  const stopped = {
    ...first,
    state: 'STOPPED' as const,
    snapshot: { ...first.snapshot, score: 10000 },
  };
  expect(
    bestComparable([late, changed, stopped, first], first)?.completedOrder,
  ).toBe(1);
  const snapshot = { ...first.snapshot, state: 'RUNNING' as const };
  expect(
    previousComparable([late, changed, stopped, first], late)?.completedOrder,
  ).toBe(1);
  expect(previousComparable([late, first], first)).toBeNull();
  expect(
    decodeRecord({
      ...first,
      state: 'INTERRUPTED',
      completedOrder: null,
      snapshot,
    }).snapshot.state,
  ).toBe('RUNNING');
  expect(() => decodeRecord({ ...first, attemptId: late.attemptId })).toThrow();
});
it('GOOD 가중치와 감점 제외가 native 정확도에 맞고 오음 피드백은 중복 계산하지 않는다', () => {
  const data = events();
  const first = data[0];
  if (!first?.event.finalOutcome) throw new Error('fixture');
  const good: StoredEvent = {
    sequence: 2,
    measureIndex: 0,
    event: {
      ...first.event,
      sequence: 2,
      noteId: 'b',
      finalOutcome: {
        ...first.event.finalOutcome,
        noteId: 'b',
        deltaRealMs: 90,
        outcome: {
          kind: 'JUDGED',
          judgement: 'GOOD',
          detail: 'LATE',
          scoreAwarded: 500,
        },
      },
    },
  };
  const excluded: StoredEvent = {
    sequence: 3,
    measureIndex: 0,
    event: {
      ...first.event,
      sequence: 3,
      noteId: 'c',
      finalOutcome: {
        ...first.event.finalOutcome,
        noteId: 'c',
        deltaRealMs: null,
        outcome: { kind: 'NOT_SCORED', reason: 'SKIPPED', scoreAwarded: 0 },
      },
    },
  };
  const wrong: StoredEvent = {
    sequence: 4,
    measureIndex: 0,
    event: {
      ...first.event,
      sequence: 4,
      finalOutcome: null,
      feedback: 'WRONG_NOTE',
    },
  };
  const measures = measureResults([...data, good, excluded, wrong]);
  expect(measures[0]).toMatchObject({
    cool: 1,
    good: 1,
    miss: 0,
    excluded: 1,
    accuracy: 75,
  });
  expect(
    timingHistogram([...data, good, excluded, wrong]).reduce(
      (sum, b) => sum + b.count,
      0,
    ),
  ).toBe(2);
});
it('조회 상한을 snapshot에 고정하고 누락·중복 최종 판정·총점 불일치를 거부한다', async () => {
  const record = recordFixture();
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    events: events(),
  });
  expect(
    await recordApi.events(record, new AbortController().signal, () => {}),
  ).toHaveLength(1);
  expect(invoke).toHaveBeenCalledWith('list_practice_events', {
    request: {
      schemaVersion: 1,
      projectId: record.projectId,
      attemptId: record.attemptId,
      afterSequence: 0,
      throughSequence: 1,
    },
  });
  vi.mocked(invoke).mockResolvedValueOnce({ schemaVersion: 1, events: [] });
  await expect(
    recordApi.events(record, new AbortController().signal, () => {}),
  ).rejects.toThrow('ARCHIVE_EVENT_GAP');
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    events: events(),
  });
  await expect(
    recordApi.events(
      { ...record, snapshot: { ...record.snapshot, score: 1500 } },
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow('ARCHIVE_EVENT_GAP');
});

it('진행 중 취소하면 다음 판정 페이지를 요청하지 않는다', async () => {
  const record = recordFixture();
  const controller = new AbortController();
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    events: events(),
  });
  await expect(
    recordApi.events(
      { ...record, snapshot: { ...record.snapshot, eventSequence: 2 } },
      controller.signal,
      () => controller.abort(),
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('native 응답 대기 중 취소하면 응답과 진행률을 적용하지 않는다', async () => {
  const record = recordFixture();
  const controller = new AbortController();
  const progress = vi.fn();
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  const pending = recordApi.events(record, controller.signal, progress);
  controller.abort();
  finish({ schemaVersion: 1, events: events() });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(progress).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledTimes(1);
});
