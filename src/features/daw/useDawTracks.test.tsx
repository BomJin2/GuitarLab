import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { importedStemFixture } from '../../test/importedStemFixture';
import { projectAssetId, projectFixtureId } from '../../test/projectFixture';
import { recordingFixture } from '../../test/recordingFixture';
import { importedStemsApi } from '../performance/importedStems';
import { mixApi, type MixLayer } from '../performance/mixing';
import { recordingApi } from '../recordings/recordings';
import { decodePeaks } from './dawWaveform';
import { useDawTracks } from './useDawTracks';

vi.mock('./dawWaveform', async (original) => ({
  ...(await original<typeof import('./dawWaveform')>()),
  decodePeaks: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const stemId = '00000000-0000-4000-8000-000000000050';
const take = recordingFixture({ projectId: projectFixtureId });
const imported = importedStemFixture();
const layer = (kind: MixLayer['kind'], id: string, patch = {}): MixLayer => ({
  kind,
  id,
  gain: 0.5,
  mute: false,
  solo: false,
  offsetMs: 0,
  ...patch,
});
function mixOf(layers: MixLayer[]) {
  return {
    mix: {
      schemaVersion: 1 as const,
      projectId: projectFixtureId,
      masterGain: 0.7,
      layers,
    },
    takes: [take],
    stems: [
      {
        id: stemId,
        role: 'GUITAR_FULL' as const,
        sha256: 'b'.repeat(64),
        peak: 0.5,
        bytes: 100,
      },
    ],
    importedStems: [],
  };
}

it('믹스 레이어를 원곡 제외 트랙 줄로 바꾸고 파형을 하나씩 읽는다', async () => {
  const takeRead = vi
    .spyOn(recordingApi, 'read')
    .mockResolvedValue(new ArrayBuffer(10));
  const stemRead = vi
    .spyOn(mixApi, 'readStem')
    .mockResolvedValue(new ArrayBuffer(20));
  vi.spyOn(importedStemsApi, 'read').mockResolvedValue({
    stem: imported,
    bytes: new ArrayBuffer(30),
  });
  vi.mocked(decodePeaks).mockResolvedValue({ peaks: [1], durationMs: 3000 });
  const mix = mixOf([
    layer('LOCAL_ASSET', projectAssetId),
    layer('TAKE', take.id, { offsetMs: 100, mute: true }),
    layer('STEM', stemId, { offsetMs: -500 }),
    layer('IMPORTED_STEM', imported.id),
  ]);
  const { result } = renderHook(() =>
    useDawTracks(mix, projectFixtureId, projectAssetId, true),
  );
  // 읽기 전: 테이크는 메타데이터로 위치·길이를 압니다.
  expect(result.current.map((t) => t.name)).toEqual([
    take.name,
    '전체 기타 · AI 추정',
    '사용자 기타 파일',
  ]);
  expect(result.current[0]).toMatchObject({
    silent: '음소거',
    startMs: 1000 - 10 + 100,
    lengthMs: 4000 * 0.5,
    peaks: undefined,
  });
  await act(async () => {});
  expect(takeRead).toHaveBeenCalledWith(
    projectFixtureId,
    take.id,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(stemRead).toHaveBeenCalledWith(
    projectFixtureId,
    projectAssetId,
    stemId,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(result.current[1]).toMatchObject({
    startMs: -500,
    lengthMs: 3000,
    peaks: [1],
  });
  expect(result.current[2]).toMatchObject({
    name: imported.name,
    peaks: [1],
  });
});

it('64MiB를 넘으면 생략하고, 실패는 실패로, 곡 위치 없는 테이크는 위치 없음으로 둔다', async () => {
  vi.spyOn(importedStemsApi, 'read').mockResolvedValue({
    stem: imported,
    bytes: new ArrayBuffer(64 * 1024 * 1024 + 1),
  });
  vi.spyOn(mixApi, 'readStem').mockRejectedValue(new Error('bad'));
  vi.spyOn(recordingApi, 'read').mockResolvedValue(new ArrayBuffer(10));
  vi.mocked(decodePeaks).mockResolvedValue({ peaks: [1], durationMs: 3000 });
  const mix = mixOf([
    layer('IMPORTED_STEM', imported.id),
    layer('STEM', stemId),
  ]);
  mix.takes = [{ ...take, songStartMs: null }];
  mix.mix.layers.push(layer('TAKE', take.id));
  const { result } = renderHook(() =>
    useDawTracks(mix, projectFixtureId, projectAssetId, true),
  );
  await act(async () => {});
  // 큰 파일 하나만 생략하고, 예산 안의 다음 테이크는 계속 읽습니다.
  expect(result.current.map((t) => t.peaks)).toEqual(['SKIPPED', null, [1]]);
  expect(result.current[2]?.startMs).toBeNull();
});

it('DAW 보기가 닫혀 있으면 파일을 읽지 않는다', async () => {
  const read = vi.spyOn(recordingApi, 'read');
  renderHook(() =>
    useDawTracks(
      mixOf([layer('TAKE', take.id)]),
      projectFixtureId,
      projectAssetId,
      false,
    ),
  );
  await act(async () => {});
  expect(read).not.toHaveBeenCalled();
});

it('음소거·다른 레이어 Solo·음량 0을 꺼짐 이유로 표시한다', () => {
  const mix = mixOf([
    layer('TAKE', take.id, { mute: true }),
    layer('STEM', stemId, { solo: true }),
    layer('IMPORTED_STEM', imported.id),
  ]);
  const { result } = renderHook(() =>
    useDawTracks(mix, projectFixtureId, projectAssetId, false),
  );
  expect(result.current.map((t) => t.silent)).toEqual([
    '음소거',
    null,
    'Solo 때문에 꺼짐',
  ]);
  const quiet = mixOf([layer('STEM', stemId, { gain: 0 })]);
  const second = renderHook(() =>
    useDawTracks(quiet, projectFixtureId, projectAssetId, false),
  );
  expect(second.result.current[0]?.silent).toBe('음량 0');
});

it('다른 파일 작업 중(STORAGE_BUSY)이면 기다렸다 다시 읽고, 끝까지 바쁘면 실패로 기억하지 않는다', async () => {
  vi.useFakeTimers();
  try {
    const read = vi
      .spyOn(recordingApi, 'read')
      .mockRejectedValueOnce(new Error('STORAGE_BUSY'))
      .mockResolvedValue(new ArrayBuffer(10));
    vi.mocked(decodePeaks).mockResolvedValue({ peaks: [1], durationMs: 3000 });
    const mix = mixOf([layer('TAKE', take.id)]);
    const first = renderHook(() =>
      useDawTracks(mix, projectFixtureId, projectAssetId, true),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(first.result.current.map((t) => t.peaks)).toEqual([[1]]);
    first.unmount();

    // 끝까지 바쁘면 실패(null)로 남기지 않고, 다시 열면 새로 읽습니다.
    read.mockReset().mockRejectedValue({ code: 'STORAGE_BUSY' });
    const { result, rerender } = renderHook(
      ({ active }) =>
        useDawTracks(mix, projectFixtureId, projectAssetId, active),
      { initialProps: { active: true } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25000);
    });
    expect(result.current.map((t) => t.peaks)).toEqual([undefined]);
    const calls = read.mock.calls.length;
    read.mockResolvedValue(new ArrayBuffer(10));
    rerender({ active: false });
    rerender({ active: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(read.mock.calls.length).toBeGreaterThan(calls);
    expect(result.current.map((t) => t.peaks)).toEqual([[1]]);
  } finally {
    vi.useRealTimers();
  }
});
