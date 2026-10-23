import type { PlayerEngine } from './PlayerEngine';

export type MediaClock = ReturnType<PlayerEngine['readClock']>;
export type InputClock = {
  schemaVersion: 1;
  streamGeneration: number;
  monotonicNs: string;
  lastRequestSequence: number;
  lastPlaybackEpoch: number;
};
export type CaptureAnchor = {
  schemaVersion: 1;
  streamGeneration: number;
  playbackEpoch: number;
  monotonicNs: string;
  songTimeMs: number;
  rate: number;
  uncertaintyRealMs: number;
};
export function decodeInputClock(value: unknown): InputClock {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('streamGeneration' in value) ||
    typeof value.streamGeneration !== 'number' ||
    !Number.isSafeInteger(value.streamGeneration) ||
    value.streamGeneration < 1 ||
    !('lastRequestSequence' in value) ||
    typeof value.lastRequestSequence !== 'number' ||
    !Number.isSafeInteger(value.lastRequestSequence) ||
    value.lastRequestSequence < 0 ||
    !('lastPlaybackEpoch' in value) ||
    typeof value.lastPlaybackEpoch !== 'number' ||
    !Number.isSafeInteger(value.lastPlaybackEpoch) ||
    value.lastPlaybackEpoch < 0 ||
    !('monotonicNs' in value) ||
    typeof value.monotonicNs !== 'string' ||
    !/^\d{1,20}$/.test(value.monotonicNs) ||
    BigInt(value.monotonicNs) > 18446744073709551615n
  )
    throw new Error('AUDIO_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    streamGeneration: value.streamGeneration,
    monotonicNs: value.monotonicNs,
    lastRequestSequence: value.lastRequestSequence,
    lastPlaybackEpoch: value.lastPlaybackEpoch,
  };
}
export function captureAnchor(
  before: MediaClock,
  after: MediaClock,
  native: InputClock,
): CaptureAnchor | null {
  const elapsed = after.performanceTimeMs - before.performanceTimeMs;
  if (
    !before.playing ||
    !after.playing ||
    before.playbackEpoch !== after.playbackEpoch ||
    before.rate !== after.rate ||
    !Number.isFinite(elapsed) ||
    elapsed <= 0 ||
    elapsed > 30 ||
    !Number.isFinite(before.songTimeMs) ||
    !Number.isFinite(after.songTimeMs) ||
    before.songTimeMs < 0 ||
    after.songTimeMs < before.songTimeMs ||
    !Number.isFinite(before.rate) ||
    before.rate < 0.5 ||
    before.rate > 1.5 ||
    Math.abs((after.songTimeMs - before.songTimeMs) / before.rate - elapsed) >
      10
  )
    return null;
  return {
    schemaVersion: 1,
    streamGeneration: native.streamGeneration,
    playbackEpoch: before.playbackEpoch,
    monotonicNs: native.monotonicNs,
    songTimeMs: (before.songTimeMs + after.songTimeMs) / 2,
    rate: before.rate,
    uncertaintyRealMs: elapsed / 2,
  };
}
