import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { recordingFixture } from '../../test/recordingFixture';
import { recordingApi, type StartRecordingRequest } from './recordings';
import { useRecording } from './useRecording';
import { listen } from '@tauri-apps/api/event';
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(listen).mockResolvedValue(() => {});
});
it('창 닫기 안내 연결 실패를 숨기지 않고 STOP 안내를 표시한다', async () => {
  vi.mocked(listen).mockRejectedValueOnce(new Error('합성 event 연결 실패'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(recordingApi, 'status').mockResolvedValue(null);
  const { result } = harness();
  await act(async () => {});
  expect(result.current.error).toContain('녹음 STOP과 저장');
  expect(result.current.take).toBeNull();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function harness() {
  const engine = new PlayerEngine();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Context.Provider value={engine}>{children}</Context.Provider>
  );
  return { ...renderHook(() => useRecording(true), { wrapper }), engine };
}
function request(): StartRecordingRequest {
  const take = recordingFixture();
  return {
    projectId: take.projectId,
    scoreRevisionId: take.scoreRevisionId,
    targetScoreTrackId: take.targetScoreTrackId,
    expectedStreamGeneration: 1,
    monitorEnvironment: 'HEADPHONES',
    source: 'INPUT_ONLY',
    transport: null,
  };
}
it('마운트와 상태 조회만으로 REC 또는 오디오 파일 기록을 시작하지 않는다', async () => {
  vi.spyOn(recordingApi, 'status').mockResolvedValue(null);
  const start = vi.spyOn(recordingApi, 'start');
  const { result } = harness();
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(start).not.toHaveBeenCalled();
  expect(result.current.take).toBeNull();
  expect(result.current.locked).toBe(false);
});

function preparedHarness() {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:recording-preparation'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {});
      createOscillator() {
        return {
          frequency: { value: 0 },
          start: vi.fn(),
          stop: vi.fn(),
          connect: vi.fn(),
          disconnect: vi.fn(),
          onended: null,
        };
      }
      createGain() {
        return { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
      }
    },
  );
  vi.spyOn(recordingApi, 'status').mockResolvedValue(null);
  const h = harness();
  h.engine.load(new Blob(['own-backing']));
  Object.defineProperty(h.engine.audio, 'duration', { value: 4 });
  h.engine.audio.dispatchEvent(new Event('loadedmetadata'));
  const take = recordingFixture({
    state: 'ARMING',
    frames: 0,
    sha256: null,
    songStartMs: null,
  });
  const req = { ...request(), transport: recordingFixture().transport };
  return { ...h, take, req };
}
it('재생 전 REC는3초 준비 후 입력 기록을 먼저 열고 동일 epoch의 반주를 시작한다', async () => {
  const h = preparedHarness();
  const order: string[] = [];
  const start = vi
    .spyOn(recordingApi, 'start')
    .mockImplementation(async (req) => {
      order.push('REC');
      return { ...h.take, transport: req.transport };
    });
  vi.spyOn(h.engine.audio, 'play').mockImplementation(async () => {
    order.push('PLAY');
  });
  let pending: Promise<void> | undefined;
  act(() => {
    pending = h.result.current.startPrepared(h.req);
    void h.result.current.startPrepared(h.req);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2999);
  });
  expect(h.result.current.preparing).toBe(true);
  expect(h.result.current.locked).toBe(true);
  expect(start).not.toHaveBeenCalled();
  expect(order).toEqual([]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(52);
    await pending;
  });
  expect(order).toEqual(['REC', 'PLAY']);
  expect(start).toHaveBeenCalledWith(
    expect.objectContaining({
      deferTransport: true,
      transport: expect.objectContaining({
        playbackEpoch: h.engine.getSnapshot().playbackEpoch,
      }),
    }),
  );
  expect(h.result.current.preparing).toBe(false);
  expect(h.result.current.take?.state).toBe('ARMING');
  expect(h.engine.getSnapshot().status).toBe('playing');
  h.unmount();
  h.engine.dispose();
});
it('준비 취소는 파일을 열지 않고 만료한 카운트인도 뒤늦게 재생하지 않는다', async () => {
  const h = preparedHarness();
  const start = vi.spyOn(recordingApi, 'start');
  const play = vi.spyOn(h.engine.audio, 'play').mockResolvedValue();
  let pending: Promise<void> | undefined;
  act(() => {
    pending = h.result.current.startPrepared(h.req);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  act(() => h.result.current.cancelPreparation());
  await act(async () => {
    await pending;
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(start).not.toHaveBeenCalled();
  expect(play).not.toHaveBeenCalled();
  expect(h.result.current.locked).toBe(false);
  expect(h.result.current.error).toContain('취소');
  h.unmount();
  h.engine.dispose();
});
it('준비 취소 뒤 늦게 열린 native 테이크도 중단하고 반주를 재생하지 않는다', async () => {
  const h = preparedHarness();
  let finish: ((take: typeof h.take) => void) | undefined;
  vi.spyOn(recordingApi, 'start').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const stop = vi.spyOn(recordingApi, 'stop').mockResolvedValue({
    ...h.take,
    state: 'RECOVERABLE_ERROR',
    errorCode: 'CLOCK_UNCERTAIN',
  });
  const play = vi.spyOn(h.engine.audio, 'play').mockResolvedValue();
  let pending: Promise<void> | undefined;
  act(() => {
    pending = h.result.current.startPrepared(h.req);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3051);
  });
  expect(finish).toBeDefined();
  act(() => h.result.current.cancelPreparation());
  await act(async () => {
    finish?.(h.take);
    await pending;
  });
  expect(stop).toHaveBeenCalledWith(h.take.id);
  expect(play).not.toHaveBeenCalled();
  expect(h.result.current.take?.state).toBe('RECOVERABLE_ERROR');
  expect(h.result.current.locked).toBe(false);
  h.unmount();
  h.engine.dispose();
});
it('재생 실패 시 이미 열린 테이크를 중단해 보존하고 준비 잠금을 해제한다', async () => {
  const h = preparedHarness();
  vi.spyOn(recordingApi, 'start').mockResolvedValue(h.take);
  const stop = vi.spyOn(recordingApi, 'stop').mockResolvedValue({
    ...h.take,
    state: 'RECOVERABLE_ERROR',
    errorCode: 'CLOCK_UNCERTAIN',
  });
  vi.spyOn(h.engine.audio, 'play').mockRejectedValue(
    new Error('own-playback-error'),
  );
  let pending: Promise<void> | undefined;
  act(() => {
    pending = h.result.current.startPrepared(h.req);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3051);
    await pending;
  });
  expect(stop).toHaveBeenCalledWith(h.take.id);
  expect(h.result.current.locked).toBe(false);
  expect(h.result.current.error).toContain('반주를 시작하지 못해');
  h.unmount();
  h.engine.dispose();
});
it('REC 중 중복 요청을 막고 늦게 끝난 이전 상태 조회가 새 테이크를 지우지 못한다', async () => {
  let finish: ((value: null) => void) | undefined;
  vi.spyOn(recordingApi, 'status')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(recordingFixture({ state: 'RECORDING', sha256: null }));
  const take = recordingFixture({ state: 'RECORDING', sha256: null });
  const start = vi.spyOn(recordingApi, 'start').mockResolvedValue(take);
  const { result } = harness();
  await act(async () => {
    await Promise.all([
      result.current.start(request()),
      result.current.start(request()),
    ]);
  });
  expect(start).toHaveBeenCalledTimes(1);
  expect(result.current.take?.id).toBe(take.id);
  expect(result.current.locked).toBe(true);
  await act(async () => {
    finish?.(null);
  });
  expect(result.current.take?.id).toBe(take.id);
  vi.spyOn(recordingApi, 'stop').mockResolvedValue({
    ...take,
    state: 'READY',
    sha256: 'a'.repeat(64),
  });
  await act(async () => {
    await result.current.stop();
  });
  expect(result.current.locked).toBe(false);
});
