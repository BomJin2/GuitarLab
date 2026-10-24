import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  decodeRecordedPitches,
  pitchAnalysisErrorCode,
  recordedPitchesApi,
  recordedPitchesError,
} from './recordedPitches';
import { recordingFixture } from '../../test/recordingFixture';
import { recordedPitchesFixture } from '../../test/recordedPitchesFixture';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.resetAllMocks());
it('현재 테이크/실제 샘플 구간과 정확한 실험 메타데이터만 표시한다', () => {
  const take = recordingFixture(),
    result = recordedPitchesFixture();
  expect(decodeRecordedPitches(result, take, 1000)).toEqual(result);
  const changes = [
    { schemaVersion: 2 },
    { projectId: take.id },
    { takeId: take.projectId },
    { startMs: 1001 },
    { durationMs: 300 },
    { frames: 9600 },
    { sampleRate: 44100 },
    { method: 'AI_CONFIRMED' },
    { state: 'MATCH' },
    { rmsDbfs: NaN },
    { path: 'private' },
    { pitches: [] },
    { pitches: [...result.pitches].reverse() },
    { pitches: [result.pitches[0], result.pitches[0]] },
    { pitches: [{ midi: 60, salience: Infinity }] },
    { pitches: [{ midi: 60, salience: 0.7, confidence: 1 }] },
    { warnings: ['EXPERIMENTAL'] },
    { warnings: [...result.warnings, 'UNKNOWN'] },
    { warnings: [...result.warnings, 'EXPERIMENTAL'] },
  ];
  for (const change of changes)
    expect(() =>
      decodeRecordedPitches({ ...result, ...change }, take, 1000),
    ).toThrow('CHORD_ANALYSIS_INVALID');
  expect(
    decodeRecordedPitches(
      {
        ...result,
        state: 'SILENT',
        rmsDbfs: -80,
        pitches: [],
        warnings: [...result.warnings, 'LOW_LEVEL'],
      },
      take,
      1000,
    ).state,
  ).toBe('SILENT');
  expect(
    decodeRecordedPitches(
      {
        ...result,
        state: 'UNVERIFIED',
        pitches: [],
        warnings: [...result.warnings, 'CLIPPED'],
      },
      take,
      1000,
    ).pitches,
  ).toEqual([]);
});
it('누락/상태/길이·구간 한도와 개인 오류 경로를 안전하게 처리한다', () => {
  const take = recordingFixture();
  expect(pitchAnalysisErrorCode(take, 3600)).toBeNull();
  expect(pitchAnalysisErrorCode(take, 3601)).toBe('CHORD_WINDOW_INVALID');
  expect(pitchAnalysisErrorCode(take, NaN)).toBe('CHORD_WINDOW_INVALID');
  expect(pitchAnalysisErrorCode({ ...take, frames: 48000 * 31 }, 0)).toBeNull();
  expect(pitchAnalysisErrorCode({ ...take, frames: 48000 * 601 }, 0)).toBe(
    'CHORD_TAKE_LIMIT',
  );
  expect(pitchAnalysisErrorCode({ ...take, droppedFrames: 1 }, 0)).toBe(
    'CHORD_TAKE_UNVERIFIED',
  );
  expect(pitchAnalysisErrorCode({ ...take, state: 'RECORDING' }, 0)).toBe(
    'CHORD_TAKE_UNVERIFIED',
  );
  expect(recordedPitchesError(new Error('C:\\private\\dry.wav'))).not.toContain(
    'private',
  );
});
it('긴 녹음의 끝400ms와 높은 샘플레이트의 실제 바이트 한도를 구분한다', () => {
  const take = { ...recordingFixture(), frames: 48000 * 600 };
  expect(pitchAnalysisErrorCode(take, 599600)).toBeNull();
  expect(pitchAnalysisErrorCode(take, 599600.1)).toBe('CHORD_WINDOW_INVALID');
  expect(pitchAnalysisErrorCode(take, 599000, 1000)).toBeNull();
  expect(pitchAnalysisErrorCode(take, 599001, 1000)).toBe(
    'PITCH_TRACK_WINDOW_INVALID',
  );
  expect(
    decodeRecordedPitches(
      { ...recordedPitchesFixture(), startMs: 599000 },
      take,
      599000,
    ).startMs,
  ).toBe(599000);
  expect(() =>
    decodeRecordedPitches(
      { ...recordedPitchesFixture(), startMs: 599900 },
      take,
      599900,
    ),
  ).toThrow();
  const large = {
    ...take,
    sampleRate: 192000,
    frames: Math.floor((256 * 1024 * 1024 - 58) / 4),
  };
  expect(pitchAnalysisErrorCode(large, 31000)).toBeNull();
  expect(
    pitchAnalysisErrorCode({ ...large, frames: large.frames + 1 }, 0),
  ).toBe('CHORD_TAKE_LIMIT');
});
it('명시적 작업은 구간만 요청하고 원본 binary를 프론트로 가져오지 않는다', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    jobId: recordingFixture().id,
    state: 'COMPLETED',
    completedBytes: 100,
    totalBytes: 100,
    result: recordedPitchesFixture(),
    errorCode: null,
  });
  expect(
    await recordedPitchesApi.analyze(
      recordingFixture(),
      1000,
      new AbortController().signal,
      () => undefined,
    ),
  ).toEqual(recordedPitchesFixture());
  expect(invoke).toHaveBeenCalledExactlyOnceWith('analyze_recording_pitches', {
    request: {
      schemaVersion: 1,
      projectId: recordingFixture().projectId,
      takeId: recordingFixture().id,
      startMs: 1000,
    },
  });
});
it('취소/잘못된 입력은 새 파일 작업을 시작하지 않는다', async () => {
  const cancel = new AbortController();
  cancel.abort();
  await expect(
    recordedPitchesApi.analyze(
      recordingFixture(),
      1000,
      cancel.signal,
      () => undefined,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await expect(
    recordedPitchesApi.analyze(
      recordingFixture(),
      3900,
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toThrow('CHORD_WINDOW_INVALID');
  expect(invoke).not.toHaveBeenCalled();
});
