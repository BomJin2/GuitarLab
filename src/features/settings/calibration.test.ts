import { describe, expect, it } from 'vitest';
import {
  decodeProfiles,
  currentProfile,
  calibrationError,
  type ProfileDocument,
} from './calibration';
import { emptyAudioSnapshot } from '../practice/audioInput';

const document: ProfileDocument = {
  schemaVersion: 1,
  revision: 1,
  profiles: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      key: {
        deviceId: 'input1',
        sampleRate: 48000,
        sampleFormat: 'f32',
        channels: 1,
        channelIndex: 0,
        bufferFrames: 256,
        monitorEnvironment: 'HEADPHONES',
      },
      biasRealMs: 30,
      method: 'MANUAL',
      jitterRealMs: null,
      samplesUsed: null,
    },
  ],
};
const input = {
  ...emptyAudioSnapshot,
  state: 'RUNNING' as const,
  deviceId: 'input1',
  sampleRate: 48000,
  sampleFormat: 'f32',
  channels: 1,
  channelIndex: 0,
  bufferFrames: 256,
};
describe('보정 프로필 계약', () => {
  it('수동값을 읽고 같은 실제 장치 설정에서만 선택한다', () => {
    expect(decodeProfiles(document)).toEqual(document);
    expect(currentProfile(document, input, 'HEADPHONES')?.biasRealMs).toBe(30);
    expect(
      currentProfile(document, { ...input, callbackFrames: 512 }, 'HEADPHONES')
        ?.biasRealMs,
    ).toBe(30);
    for (const patch of [
      { deviceId: 'input2' },
      { sampleRate: 44100 },
      { sampleFormat: 'i16' },
      { channels: 2 },
      { channelIndex: 1 },
      { bufferFrames: 512 },
      { state: 'STOPPED' as const },
    ])
      expect(
        currentProfile(document, { ...input, ...patch }, 'HEADPHONES'),
      ).toBeUndefined();
    expect(currentProfile(document, input, 'SPEAKERS')).toBeUndefined();
  });
  it('손상·과범위·중복·불완전한 측정 결과를 거부한다', () => {
    expect(() => decodeProfiles({ ...document, schemaVersion: 2 })).toThrow();
    expect(() =>
      decodeProfiles({
        ...document,
        profiles: [...document.profiles, ...document.profiles],
      }),
    ).toThrow();
    const profile = document.profiles[0];
    for (const patch of [
      { biasRealMs: 501 },
      { id: 'bad-id' },
      { method: 'MEASURED' },
      { jitterRealMs: 10 },
    ])
      expect(() =>
        decodeProfiles({ ...document, profiles: [{ ...profile, ...patch }] }),
      ).toThrow();
    expect(() =>
      decodeProfiles({
        ...document,
        profiles: [{ ...profile, key: { ...profile?.key, bufferFrames: 0 } }],
      }),
    ).toThrow();
  });
  it('충돌을 안내하고 원문 경로를 숨긴다', () => {
    expect(calibrationError({ code: 'REVISION_CONFLICT' })).toContain(
      '다시 읽은',
    );
    expect(
      calibrationError(new Error('C:/private/profiles.json')),
    ).not.toContain('private');
  });
});
