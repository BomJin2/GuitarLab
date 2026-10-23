import { describe, expect, it } from 'vitest';
import {
  captureAnchor,
  decodeInputClock,
  type MediaClock,
} from './captureClock';

const native = {
  schemaVersion: 1,
  streamGeneration: 1,
  monotonicNs: '9999999999999999999',
  lastRequestSequence: 0,
  lastPlaybackEpoch: 0,
} as const;
const before: MediaClock = {
  performanceTimeMs: 1000,
  songTimeMs: 2000,
  rate: 0.75,
  playbackEpoch: 1,
  playing: true,
};
describe('미디어 clock handshake', () => {
  it('왕복 midpoint와 불확실성을 계산하고 ns 정밀도를 보존한다', () => {
    const anchor = captureAnchor(
      before,
      { ...before, performanceTimeMs: 1010, songTimeMs: 2007.5 },
      native,
    );
    expect(anchor?.songTimeMs).toBe(2003.75);
    expect(anchor?.uncertaintyRealMs).toBe(5);
    expect(anchor?.monotonicNs).toBe(native.monotonicNs);
  });
  it('seek/rate/pause 및 높은 왕복 지연·미디어 정지를 거부한다', () => {
    const after = { ...before, performanceTimeMs: 1010, songTimeMs: 2007.5 };
    for (const patch of [
      { playbackEpoch: 2 },
      { rate: 1 },
      { playing: false },
      { performanceTimeMs: 1040 },
      { songTimeMs: 1900 },
      { performanceTimeMs: 1020, songTimeMs: 2000 },
    ])
      expect(captureAnchor(before, { ...after, ...patch }, native)).toBeNull();
  });
  it('잘못된 native 버전·stream generation·timestamp를 거부한다', () => {
    expect(decodeInputClock(native)).toEqual(native);
    for (const patch of [
      { schemaVersion: 2 },
      { streamGeneration: 0 },
      { lastRequestSequence: -1 },
      { lastPlaybackEpoch: Number.MAX_SAFE_INTEGER + 1 },
      { monotonicNs: 10 },
      { monotonicNs: '18446744073709551616' },
      { monotonicNs: '-1' },
    ])
      expect(() => decodeInputClock({ ...native, ...patch })).toThrow();
  });
});
