import { describe, expect, it } from 'vitest';
import {
  decodeDevices,
  decodeSnapshot,
  emptyAudioSnapshot,
  inputError,
} from './audioInput';

describe('네이티브 입력 계약', () => {
  it('기본 출력 표시는 선택적 boolean이며 기존 목록도 계속 읽는다', () => {
    const device = {
      id: 'out',
      name: '출력',
      channels: 2,
      sampleRate: 48000,
      sampleFormat: 'f32',
    };
    expect(
      decodeDevices({
        schemaVersion: 1,
        devices: [{ ...device, isDefault: true }],
      })[0]?.isDefault,
    ).toBe(true);
    expect(
      decodeDevices({ schemaVersion: 1, devices: [device] })[0]?.isDefault,
    ).toBeUndefined();
    expect(() =>
      decodeDevices({
        schemaVersion: 1,
        devices: [{ ...device, isDefault: 'true' }],
      }),
    ).toThrow();
  });
  it('피치 미확정 onset과 처리 마감 시각을 보존하고 잘못된 값을 거부한다', () => {
    const state = {
      ...emptyAudioSnapshot,
      capturedMonotonicNs: '500000000',
      judgementWatermarkNs: '290000000',
      onsets: [
        {
          sequence: 1,
          captureSampleIndex: 4800,
          capturedMonotonicNs: '100000000',
          pitchMidi: null,
          confidence: 0,
        },
      ],
    };
    expect(decodeSnapshot(state).onsets[0]?.pitchMidi).toBeNull();
    expect(() =>
      decodeSnapshot({ ...state, judgementWatermarkNs: '500000001' }),
    ).toThrow();
    expect(() =>
      decodeSnapshot({
        ...state,
        onsets: [{ ...state.onsets[0], confidence: 1 }],
      }),
    ).toThrow();
  });
  it('정상 상태와 64비트 timestamp를 손실 없이 유지한다', () => {
    const state = {
      ...emptyAudioSnapshot,
      capturedMonotonicNs: '9999999999999999999',
    };
    expect(decodeSnapshot(state).capturedMonotonicNs).toBe(
      state.capturedMonotonicNs,
    );
    expect(
      decodeDevices({
        schemaVersion: 1,
        devices: [
          {
            id: 'device',
            name: '입력',
            channels: 2,
            sampleRate: 48000,
            sampleFormat: 'f32',
          },
        ],
      }),
    ).toHaveLength(1);
  });
  it('버전·음정·프레임·onset·장치 범위 오류를 거부한다', () => {
    for (const patch of [
      { schemaVersion: 2 },
      { state: 'unknown' },
      { droppedFrames: -1 },
      { bufferFrames: 0 },
      { bufferFrames: 192001 },
      { pitchMidi: NaN },
      { confidence: 1.1 },
      { capturedMonotonicNs: 1 },
      { capturedMonotonicNs: '18446744073709551616' },
      { onsets: [{ sequence: 1 }] },
    ])
      expect(() => decodeSnapshot({ ...emptyAudioSnapshot, ...patch })).toThrow(
        'AUDIO_CONTRACT_INVALID',
      );
    expect(() =>
      decodeDevices({
        schemaVersion: 1,
        devices: [
          {
            id: 'x',
            name: 'x',
            channels: 0,
            sampleRate: 48000,
            sampleFormat: 'f32',
          },
        ],
      }),
    ).toThrow();
  });
  it('권한 오류를 표시하며 원문 경로는 숨긴다', () => {
    expect(
      inputError({ code: 'AUDIO_PERMISSION_DENIED', message: '민감한 경로' }),
    ).toContain('마이크 권한');
    expect(inputError(new Error('C:/private/audio.wav'))).not.toContain(
      'private',
    );
  });
});
