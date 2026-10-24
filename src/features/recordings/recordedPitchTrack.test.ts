import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  decodeRecordedPitchTrack,
  recordedPitchTrackApi,
} from './recordedPitchTrack';
import { pitchAnalysisErrorCode } from './recordedPitches';
import { recordingFixture } from '../../test/recordingFixture';
import {
  recordedPitchTrackFixture,
  recordedOscillationFixture,
} from '../../test/recordedPitchTrackFixture';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.resetAllMocks());
it('10분 녹음의 마지막1초 응답도 샘플 기준 시각으로 수용한다', () => {
  const take = { ...recordingFixture(), frames: 48000 * 600 };
  const result = { ...recordedPitchTrackFixture(), startMs: 599000 };
  expect(decodeRecordedPitchTrack(result, take, 599000).startMs).toBe(599000);
  expect(() =>
    decodeRecordedPitchTrack({ ...result, startMs: 599001 }, take, 599001),
  ).toThrow('PITCH_TRACK_ANALYSIS_INVALID');
});
it('현재 테이크의 실제 창 위치·유효 비율·주기성·변화량만 수용한다', () => {
  const take = recordingFixture(),
    track = recordedPitchTrackFixture();
  expect(decodeRecordedPitchTrack(track, take, 1000)).toEqual(track);
  const first = track.points[0];
  if (!first) throw new Error('자체 궤적 필요');
  for (const change of [
    { schemaVersion: 3 },
    { takeId: take.projectId },
    { projectId: take.id },
    { sampleRate: 44100 },
    { durationMs: 400 },
    { frames: 19200 },
    { startMs: 1001 },
    { method: 'BEND_CONFIRMED' },
    { motion: 'BEND' },
    { motion: ['RISING'] },
    { coverage: 0.5 },
    { coverage: NaN },
    { deltaCents: 200 },
    { deltaCents: null },
    { minConfidence: 1 },
    { minConfidence: null },
    { rmsDbfs: Infinity },
    { path: 'private' },
    { points: [] },
    { points: [...track.points].reverse() },
    {
      points: [
        { ...first, timeMs: first.timeMs + 1 },
        ...track.points.slice(1),
      ],
    },
    { points: [{ ...first, pitchMidi: null }, ...track.points.slice(1)] },
    { points: [{ ...first, confidence: 0.89 }, ...track.points.slice(1)] },
    { points: [{ ...first, extra: 1 }, ...track.points.slice(1)] },
    { warnings: ['EXPERIMENTAL'] },
    { warnings: [...track.warnings, 'UNKNOWN'] },
    { warnings: [...track.warnings, 'EXPERIMENTAL'] },
    { warnings: [...track.warnings, 'CLIPPED'] },
    { motion: 'FALLING' },
  ])
    expect(() =>
      decodeRecordedPitchTrack({ ...track, ...change }, take, 1000),
    ).toThrow('PITCH_TRACK_ANALYSIS_INVALID');
  expect(
    decodeRecordedPitchTrack(
      {
        ...track,
        motion: 'UNVERIFIED',
        coverage: 0,
        deltaCents: null,
        minConfidence: null,
        points: [],
        rmsDbfs: -80,
        warnings: [...track.warnings, 'LOW_LEVEL'],
      },
      take,
      1000,
    ).motion,
  ).toBe('UNVERIFIED');
  expect(
    decodeRecordedPitchTrack(
      {
        ...track,
        motion: 'UNVERIFIED',
        coverage: 0,
        deltaCents: null,
        minConfidence: null,
        points: track.points.map((p) => ({
          ...p,
          pitchMidi: null,
          confidence: null,
        })),
        warnings: [...track.warnings, 'LOW_COVERAGE'],
      },
      take,
      1000,
    ).coverage,
  ).toBe(0);
});
it('v1을 호환 처리하고 주기적 변화의 v2 수치·모션 관계를 검증한다', () => {
  const take = recordingFixture(),
    track = recordedPitchTrackFixture();
  const legacy: Record<string, unknown> = { ...track, schemaVersion: 1 };
  delete legacy.oscillation;
  expect(decodeRecordedPitchTrack(legacy, take, 1000)).toEqual({
    ...track,
    schemaVersion: 1,
  });
  const oscillating = recordedOscillationFixture();
  expect(decodeRecordedPitchTrack(oscillating, take, 1000)).toEqual(
    oscillating,
  );
  for (const change of [
    { oscillation: null },
    { motion: 'RISING' },
    { schemaVersion: 1 },
    { oscillation: { ...oscillating.oscillation, rateHz: NaN } },
    { oscillation: { ...oscillating.oscillation, cycles: 2 } },
    { oscillation: { ...oscillating.oscillation, fit: 0.84 } },
    { oscillation: { ...oscillating.oscillation, depthCents: 151 } },
    { oscillation: { ...oscillating.oscillation, rateHz: 6.01 } },
    { oscillation: { ...oscillating.oscillation, extra: 1 } },
  ])
    expect(() =>
      decodeRecordedPitchTrack({ ...oscillating, ...change }, take, 1000),
    ).toThrow('PITCH_TRACK_ANALYSIS_INVALID');
});
it('1초 구간 한도와 취소를 지키며 명시적 native job에 ID·시각만 보낸다', async () => {
  const take = recordingFixture(),
    track = recordedPitchTrackFixture();
  expect(pitchAnalysisErrorCode(take, 3000, 1000)).toBeNull();
  expect(pitchAnalysisErrorCode(take, 3001, 1000)).toBe(
    'PITCH_TRACK_WINDOW_INVALID',
  );
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    jobId: take.id,
    state: 'COMPLETED',
    completedBytes: 100,
    totalBytes: 100,
    result: track,
    errorCode: null,
  });
  expect(
    await recordedPitchTrackApi.analyze(
      take,
      1000,
      new AbortController().signal,
      () => undefined,
    ),
  ).toEqual(track);
  expect(invoke).toHaveBeenCalledExactlyOnceWith(
    'analyze_recording_pitch_track',
    {
      request: {
        schemaVersion: 1,
        projectId: take.projectId,
        takeId: take.id,
        startMs: 1000,
      },
    },
  );
  vi.mocked(invoke).mockClear();
  await expect(
    recordedPitchTrackApi.analyze(
      take,
      3001,
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toThrow('PITCH_TRACK_WINDOW_INVALID');
  const cancel = new AbortController();
  cancel.abort();
  await expect(
    recordedPitchTrackApi.analyze(take, 1000, cancel.signal, () => undefined),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(invoke).not.toHaveBeenCalled();
});
