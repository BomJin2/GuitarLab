import { describe, expect, it } from 'vitest';
import { decodeMeasurement } from './calibrationMeasurement';
import { decodeProfiles } from './calibration';
const snapshot = {
  schemaVersion: 1,
  measurementId: '00000000-0000-4000-8000-000000000001',
  state: 'READY',
  sampleCount: 16,
  estimate: {
    biasRealMs: 30,
    jitterRealMs: 2,
    samplesUsed: 15,
    samplesRejected: 1,
  },
  estimateErrorCode: null,
};
describe('반복 측정 계약', () => {
  it('실제 서버 표본 수·종료 상태·추정을 검증한다', () => {
    expect(decodeMeasurement(snapshot).estimate?.samplesUsed).toBe(15);
    expect(
      decodeMeasurement({ ...snapshot, state: 'CANCELED', estimate: null })
        .state,
    ).toBe('CANCELED');
    for (const patch of [
      { sampleCount: 17 },
      { state: 'READY', sampleCount: 8 },
      { estimate: { ...snapshot.estimate, samplesUsed: 7 } },
      { state: 'SAVED' },
      { estimateErrorCode: 'C:/private/file' },
      { measurementId: 'wrong' },
    ])
      expect(() => decodeMeasurement({ ...snapshot, ...patch })).toThrow();
  });
  it('저장된 측정값은 통계를 포함해야 하며 MANUAL과 혼용하지 않는다', () => {
    const profile = {
      id: snapshot.measurementId,
      key: {
        deviceId: 'input1',
        sampleRate: 48000,
        sampleFormat: 'f32',
        channels: 1,
        channelIndex: 0,
        bufferFrames: 480,
        monitorEnvironment: 'HEADPHONES',
      },
      biasRealMs: 30,
      method: 'MEASURED',
      jitterRealMs: 2,
      samplesUsed: 16,
    };
    expect(
      decodeProfiles({ schemaVersion: 1, revision: 1, profiles: [profile] })
        .profiles[0]?.method,
    ).toBe('MEASURED');
    expect(() =>
      decodeProfiles({
        schemaVersion: 1,
        revision: 1,
        profiles: [{ ...profile, method: 'MANUAL' }],
      }),
    ).toThrow();
  });
});
