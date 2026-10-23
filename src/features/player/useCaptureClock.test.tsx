import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Context } from './playerContextValue';
import { PlayerEngine } from './PlayerEngine';
import { useCaptureClock } from './useCaptureClock';
import { emptyAudioSnapshot } from '../practice/audioInput';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => false,
}));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function harness() {
  const engine = new PlayerEngine();
  const initial = engine.getSnapshot();
  let clockTime = 1000;
  let playing = true;
  let epoch = 1;
  let listener = () => {};
  vi.spyOn(engine, 'readClock').mockImplementation(() => {
    clockTime += 5;
    return {
      performanceTimeMs: clockTime,
      songTimeMs: clockTime + 1000,
      rate: 1,
      playbackEpoch: epoch,
      playing,
    };
  });
  vi.spyOn(engine, 'getSnapshot').mockImplementation(() => ({
    ...initial,
    audioTimeMs: 0,
    durationMs: 4000,
    rate: 1,
    playbackEpoch: epoch,
    status: playing ? 'playing' : 'paused',
    error: null,
    loop: null,
    volume: 1,
    metronomeEnabled: false,
    metronomeVolume: 0.1,
    timing: { bpm: 120, numerator: 4, denominator: 4 },
  }));
  vi.spyOn(engine, 'subscribe').mockImplementation((callback) => {
    listener = callback;
    return () => {};
  });
  vi.spyOn(engine, 'synchronizeEpochFloor').mockImplementation((floor) => {
    if (epoch < floor) {
      epoch = floor + 1;
      listener();
    }
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Context.Provider value={engine}>{children}</Context.Provider>
  );
  return {
    wrapper,
    pause: () => {
      playing = false;
      epoch++;
      listener();
    },
  };
}
const running = {
  ...emptyAudioSnapshot,
  state: 'RUNNING' as const,
  streamGeneration: 1,
  deviceId: 'input1',
  sampleRate: 48000,
  channels: 1,
};
describe('capture clock의 비동기 생명주기', () => {
  it('실제 media 표본으로 handshake하며 native가 검증한 진단만 표시한다', async () => {
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === 'get_audio_clock'
        ? {
            schemaVersion: 1,
            streamGeneration: 1,
            monotonicNs: '1000000000',
            lastRequestSequence: 0,
            lastPlaybackEpoch: 0,
          }
        : {
            schemaVersion: 1,
            ready: true,
            anchorCount: 3,
            maximumResidualRealMs: 1,
          },
    );
    const { wrapper } = harness();
    const { result } = renderHook(() => useCaptureClock(running, true), {
      wrapper,
    });
    await act(async () => {});
    expect(result.current.status).toBe('READY');
    expect(result.current.roundTripMs).toBe(5);
    expect(invoke).toHaveBeenCalledWith(
      'update_capture_clock',
      expect.objectContaining({
        request: expect.objectContaining({
          anchor: expect.objectContaining({
            songTimeMs: 2007.5,
            uncertaintyRealMs: 2.5,
          }),
        }),
      }),
    );
  });
  it('pause 이전의 늦은 clock 완료를 버리고 새 epoch를 무효화한다', async () => {
    let finish: (value: unknown) => void = () => {};
    const pending = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === 'get_audio_clock'
        ? pending
        : {
            schemaVersion: 1,
            ready: false,
            anchorCount: 0,
            maximumResidualRealMs: 0,
          },
    );
    const { wrapper, pause } = harness();
    const { result } = renderHook(() => useCaptureClock(running, true), {
      wrapper,
    });
    act(pause);
    await act(async () => {
      finish({
        schemaVersion: 1,
        streamGeneration: 1,
        monotonicNs: '1000000000',
        lastRequestSequence: 0,
        lastPlaybackEpoch: 0,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.status).toBe('IDLE');
    expect(invoke).toHaveBeenCalledWith('update_capture_clock', {
      request: {
        schemaVersion: 1,
        streamGeneration: 1,
        playbackEpoch: 2,
        requestSequence: 1,
        anchor: null,
      },
    });
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === 'update_capture_clock'),
    ).toHaveLength(1);
  });
  it('미입력/브라우저에서는 clock IPC를 수행하지 않는다', async () => {
    const { wrapper } = harness();
    const { result } = renderHook(
      () => useCaptureClock(emptyAudioSnapshot, false),
      { wrapper },
    );
    await act(async () => {});
    expect(result.current.status).toBe('IDLE');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('전용 보정 clock이 활성화되면 media bridge는 요청하지 않는다', async () => {
    const { wrapper } = harness();
    const { result } = renderHook(() => useCaptureClock(running, true, false), {
      wrapper,
    });
    await act(async () => {});
    expect(result.current.status).toBe('IDLE');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('재마운트는 서버 sequence와 epoch 이후로 이어서 요청한다', async () => {
    let nativeSequence = 10;
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'get_audio_clock')
        return {
          schemaVersion: 1,
          streamGeneration: 1,
          monotonicNs: '1000000000',
          lastRequestSequence: nativeSequence,
          lastPlaybackEpoch: 5,
        };
      nativeSequence++;
      return {
        schemaVersion: 1,
        ready: true,
        anchorCount: 3,
        maximumResidualRealMs: 1,
      };
    });
    const { wrapper } = harness();
    const first = renderHook(() => useCaptureClock(running, true), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(first.result.current.status).toBe('READY');
    first.unmount();
    const second = renderHook(() => useCaptureClock(running, true), {
      wrapper,
    });
    await act(async () => {});
    expect(second.result.current.status).toBe('READY');
    const updates = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === 'update_capture_clock');
    expect(updates).toHaveLength(2);
    expect(updates[0]?.[1]).toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          requestSequence: 11,
          playbackEpoch: 6,
        }),
      }),
    );
    expect(updates[1]?.[1]).toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          requestSequence: 12,
          playbackEpoch: 6,
        }),
      }),
    );
  });
});
