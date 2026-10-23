import { describe, expect, it } from 'vitest';
import { recordingFixture } from '../../test/recordingFixture';
import {
  comparisonWarnings,
  decodeTake,
  recordedSampleToSongMs,
  recordingActive,
} from './recordings';
import { waveformPeaks } from './waveform';
describe('녹음 계약과 시간 매핑', () => {
  it('sample index는 정수 문자열로 보존하고 입력 외 출처·손상·과범위 응답을 거부한다', () => {
    const take = recordingFixture();
    expect(decodeTake(take)).toEqual(take);
    for (const patch of [
      { source: 'LOOPBACK' },
      { songStartMs: -60001 },
      { referenceTakeIds: [take.id] },
      { referenceTakeIds: ['not-an-id'] },
      { referenceTakeIds: [take.projectId, take.projectId] },
      { source: 'YOUTUBE' },
      { origin: 'AI' },
      { channels: 2 },
      { frames: 48000 * 601 },
      { peak: NaN },
      { state: 'READY', frames: 0 },
      { sha256: null },
      { captureStartSampleIndex: 18446744073709000000 },
      { captureStartMonotonicNs: '18446744073709551616' },
      { transport: null },
      {
        calibration: {
          ...take.calibration,
          key: { ...take.calibration.key, sampleRate: 44100 },
        },
      },
    ])
      expect(() => decodeTake({ ...take, ...patch })).toThrow();
    expect(
      recordingActive(recordingFixture({ state: 'RECORDING', sha256: null })),
    ).toBe(true);
    expect(recordingActive(take)).toBe(false);
  });
  it('녹음 샘플 시간에 당시 배속과 보정된 시작점·수동 offset을 정확히 한 번 적용한다', () => {
    const take = recordingFixture();
    expect(recordedSampleToSongMs(take, 0)).toBe(990);
    expect(recordedSampleToSongMs(take, 48000)).toBe(1490);
    expect(recordedSampleToSongMs(take, 192000)).toBe(2990);
    expect(recordedSampleToSongMs(take, -1)).toBeNull();
    expect(recordedSampleToSongMs(take, 192001)).toBeNull();
    expect(
      recordedSampleToSongMs(
        recordingFixture({ transport: null, songStartMs: null }),
        1000,
      ),
    ).toBeNull();
  });
  it('A/B의 리비전·트랙·배속·보정 차이를 경고하고 같은 조건을 동일하게 유지한다', () => {
    const a = recordingFixture();
    expect(comparisonWarnings(a, recordingFixture())).toEqual([]);
    const b = recordingFixture({
      scoreRevisionId: '00000000-0000-4000-8000-000000000009',
      targetScoreTrackId: 'track-1',
      transport: { ...a.transport!, rate: 1 },
      calibration: { ...a.calibration, biasRealMs: 0 },
    });
    expect(comparisonWarnings(a, b)).toHaveLength(4);
    expect(
      comparisonWarnings(
        a,
        recordingFixture({ transport: null, songStartMs: null }),
      ),
    ).toContain('무반주 녹음은 악보 시간에 정렬되지 않았습니다');
  });
});
it('실제 float PCM 파형은 정해진 bin 수로 집계하고 NaN·틀린 헤더를 거부한다', () => {
  const bytes = new ArrayBuffer(58 + 16);
  const view = new DataView(bytes);
  const put = (at: number, value: string) =>
    new Uint8Array(bytes, at, value.length).set(
      new TextEncoder().encode(value),
    );
  put(0, 'RIFF');
  put(8, 'WAVEfmt ');
  view.setUint16(20, 3, true);
  view.setUint16(22, 1, true);
  view.setUint16(34, 32, true);
  put(50, 'data');
  view.setUint32(54, 16, true);
  [0.5, -1.25, 0, 0.25].forEach((v, i) => view.setFloat32(58 + i * 4, v, true));
  expect(waveformPeaks(bytes, 2)).toEqual([1.25, 0.25]);
  view.setFloat32(58, NaN, true);
  expect(() => waveformPeaks(bytes)).toThrow();
  expect(() => waveformPeaks(new ArrayBuffer(4))).toThrow();
  expect(() => waveformPeaks(bytes, 0)).toThrow();
});
