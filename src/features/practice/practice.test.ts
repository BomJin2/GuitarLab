import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { ScoreDocument } from '../../entities/score';
import { practiceFixture, practiceFixtureId } from '../../test/practiceFixture';
import {
  buildPracticeTargets,
  decodeAttempt,
  practiceApi,
  validJudgementSettings,
} from './practice';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
describe('단음 채점 경계 계약', () => {
  it('문자열처럼 변환되는 배열 enum은 계약 값으로 허용하지 않는다', () => {
    const snapshot = practiceFixture();
    const first = snapshot.events[0];
    if (!first?.finalOutcome) throw new Error('판정 fixture 누락');
    expect(() =>
      decodeAttempt({
        ...snapshot,
        events: [
          {
            ...first,
            finalOutcome: {
              ...first.finalOutcome,
              outcome: {
                kind: 'JUDGED',
                judgement: 'COOL',
                detail: ['EARLY'],
                scoreAwarded: 1000,
              },
            },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      decodeAttempt({
        ...snapshot,
        events: [
          {
            ...first,
            finalOutcome: {
              ...first.finalOutcome,
              outcome: {
                kind: 'NOT_SCORED',
                reason: ['SKIPPED'],
                scoreAwarded: 0,
              },
            },
          },
        ],
      }),
    ).toThrow();
  });
  it('선택 트랙 공격 음만 실제 앵커와 반복 구간으로 변환한다', () => {
    const document: ScoreDocument = {
      schemaVersion: 1,
      id: 'score',
      title: 'fixture',
      ppq: 960,
      tempoMap: [],
      timeSignatures: [],
      syncAnchors: [
        { scoreTick: 0, audioTimeMs: 1000 },
        { scoreTick: 960, audioTimeMs: 2000 },
      ],
      tracks: [
        {
          id: 'one',
          name: 'one',
          tuningMidi: [],
          notes: [
            {
              id: 'a',
              trackId: 'one',
              measureIndex: 0,
              startTick: 0,
              durationTicks: 960,
              pitchMidi: 67,
              source: 'import',
            },
            {
              id: 'tie',
              trackId: 'one',
              measureIndex: 1,
              startTick: 960,
              durationTicks: 960,
              pitchMidi: 67,
              attack: false,
              source: 'import',
            },
            {
              id: 'b',
              trackId: 'one',
              measureIndex: 2,
              startTick: 1920,
              durationTicks: 960,
              pitchMidi: 64,
              source: 'import',
            },
          ],
        },
        { id: 'two', name: 'two', tuningMidi: [], notes: [] },
      ],
    };
    expect(buildPracticeTargets(document, 0, 4000, null)).toEqual([
      { id: 'a', songTimeMs: 1000, pitchMidi: 67 },
      { id: 'b', songTimeMs: 3000, pitchMidi: 64 },
    ]);
    expect(
      buildPracticeTargets(document, 0, 4000, { startMs: 1000, endMs: 3000 }),
    ).toEqual([{ id: 'a', songTimeMs: 1000, pitchMidi: 67 }]);
    expect(buildPracticeTargets(document, 1, 4000, null)).toEqual([]);
  });
  it('검사되지 않은 점수·보정·이전 epoch 이벤트를 거부한다', () => {
    const snapshot = practiceFixture();
    expect(decodeAttempt(snapshot)).toEqual(snapshot);
    expect(() => decodeAttempt({ ...snapshot, score: 2000 })).toThrow();
    expect(() => decodeAttempt({ ...snapshot, accuracy: 50 })).toThrow();
    expect(() => decodeAttempt({ ...snapshot, state: 'FINISHED' })).toThrow();
    expect(() =>
      decodeAttempt({
        ...snapshot,
        calibrationProfile: {
          ...snapshot.calibrationProfile,
          biasRealMs: Number.NaN,
        },
      }),
    ).toThrow();
    expect(() => decodeAttempt({ ...snapshot, playbackEpoch: 3 })).toThrow();
    expect(
      validJudgementSettings({
        coolMs: 80,
        goodMs: 50,
        pitchToleranceCents: 50,
      }),
    ).toBe(false);
  });
  it('조회와 중지는 ID만 전달하고 관측 음이나 점수를 전달하지 않는다', async () => {
    vi.mocked(invoke).mockResolvedValue(practiceFixture());
    await practiceApi.poll(practiceFixtureId);
    await practiceApi.stop(practiceFixtureId);
    expect(invoke).toHaveBeenCalledWith('get_practice_attempt', {
      request: { schemaVersion: 1, attemptId: practiceFixtureId },
    });
    expect(invoke).toHaveBeenCalledWith('stop_practice_attempt', {
      request: { schemaVersion: 1, attemptId: practiceFixtureId },
    });
  });
});
