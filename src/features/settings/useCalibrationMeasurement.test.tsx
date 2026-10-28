import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { CalibrationClickClock } from './CalibrationClickClock';
import { useCalibrationMeasurement } from './useCalibrationMeasurement';
import { emptyAudioSnapshot } from '../practice/audioInput';
import type { AudioInputController } from '../practice/useAudioInput';
import type { CalibrationController } from './useCalibration';
import { inputMonitorApi, emptyInputMonitor } from '../practice/monitoring';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const id = '00000000-0000-4000-8000-000000000001';
const measured = {
  schemaVersion: 1,
  measurementId: id,
  state: 'COLLECTING',
  sampleCount: 8,
  estimate: {
    biasRealMs: 30,
    jitterRealMs: 2,
    samplesUsed: 8,
    samplesRejected: 0,
  },
  estimateErrorCode: null,
};
function harness() {
  const monitor = vi
    .spyOn(inputMonitorApi, 'status')
    .mockResolvedValue(emptyInputMonitor);
  const engine = new PlayerEngine();
  vi.spyOn(engine.audio, 'pause').mockImplementation(() => {});
  vi.spyOn(CalibrationClickClock.prototype, 'start').mockResolvedValue();
  const stop = vi
    .spyOn(CalibrationClickClock.prototype, 'stop')
    .mockResolvedValue();
  let time = 1000;
  vi.spyOn(CalibrationClickClock.prototype, 'readClock').mockImplementation(
    (epoch) => {
      time += 5;
      return {
        performanceTimeMs: time,
        songTimeMs: time,
        rate: 1,
        playbackEpoch: epoch,
        playing: true,
      };
    },
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Context.Provider value={engine}>{children}</Context.Provider>
  );
  const input: AudioInputController = {
    state: {
      ...emptyAudioSnapshot,
      state: 'RUNNING',
      streamGeneration: 1,
      bufferFrames: 480,
    },
    native: true,
    devices: [],
    devicesLoaded: true,
    busy: false,
    error: null,
    refresh: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const calibration: CalibrationController = {
    document: { schemaVersion: 1, revision: 0, profiles: [] },
    status: 'IDLE',
    error: null,
    load: vi.fn(),
    save: vi.fn(),
    applySaved: vi.fn(),
  };
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'get_audio_clock')
      return {
        schemaVersion: 1,
        streamGeneration: 1,
        monotonicNs: '1000000000',
        lastRequestSequence: 0,
        lastPlaybackEpoch: 1,
      };
    if (command === 'update_capture_clock')
      return {
        schemaVersion: 1,
        ready: true,
        anchorCount: 3,
        maximumResidualRealMs: 1,
      };
    if (command === 'start_calibration_measurement')
      return { ...measured, sampleCount: 0, estimate: null };
    if (command === 'get_calibration_measurement') return measured;
    if (command === 'cancel_calibration_measurement')
      return { ...measured, state: 'CANCELED', estimate: null };
    if (command === 'save_measured_calibration')
      return { schemaVersion: 1, revision: 1, profiles: [] };
    throw new Error('예상하지 않은 테스트 명령');
  });
  return { engine, wrapper, input, calibration, stop, monitor };
}
describe('보정 측정의 비동기 생명주기', () => {
  it('모니터 상태를 확인하지 못하면 유선 출력과 native 측정을 시작하지 않는다', async () => {
    const { wrapper, input, calibration, monitor } = harness();
    monitor.mockRejectedValue(new Error('상태 조회 실패'));
    const { result } = renderHook(
      () => useCalibrationMeasurement(input, calibration),
      { wrapper },
    );
    await act(async () => {
      await result.current.start('HEADPHONES', 'CABLE');
    });
    expect(result.current.status).toBe('ERROR');
    expect(result.current.active).toBe(false);
    expect(CalibrationClickClock.prototype.start).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('유선 관측은 별도 신호를 사용하고 추정이 있어도 저장 API를 호출하지 않는다', async () => {
    const { wrapper, input, calibration } = harness();
    const { result } = renderHook(
      () => useCalibrationMeasurement(input, calibration),
      { wrapper },
    );
    await act(async () => {
      await result.current.start('HEADPHONES', 'CABLE');
    });
    expect(CalibrationClickClock.prototype.start).toHaveBeenCalledWith('CABLE');
    expect(result.current.mode).toBe('CABLE');
    expect(result.current.snapshot?.estimate?.biasRealMs).toBe(30);
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.error).toContain('저장하지 않습니다');
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(
          ([command]) => command === 'save_measured_calibration',
        ),
    ).toBe(false);
    expect(calibration.applySaved).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.cancel();
    });
  });
  it('켜진 모니터는 유선 출력 전에 거부하며 일반 보정에는 새 조회를 추가하지 않는다', async () => {
    const { wrapper, input, calibration, monitor } = harness();
    monitor.mockResolvedValue({ ...emptyInputMonitor, state: 'RUNNING' });
    const { result } = renderHook(
      () => useCalibrationMeasurement(input, calibration),
      { wrapper },
    );
    await act(async () => {
      await result.current.start('HEADPHONES', 'CABLE');
    });
    expect(result.current.status).toBe('ERROR');
    expect(result.current.error).toContain('모니터를 완전히 끈 뒤');
    expect(CalibrationClickClock.prototype.start).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    monitor.mockClear();
    await act(async () => {
      await result.current.start('HEADPHONES');
    });
    expect(monitor).not.toHaveBeenCalled();
    expect(CalibrationClickClock.prototype.start).toHaveBeenCalledWith('PLUCK');
    await act(async () => {
      await result.current.cancel();
    });
  });
  it('유선 관측 중 모니터가 켜지면 신호와 native 측정을 취소한다', async () => {
    const { wrapper, input, calibration, monitor, stop } = harness();
    const { result } = renderHook(
      () => useCalibrationMeasurement(input, calibration),
      { wrapper },
    );
    await act(async () => {
      await result.current.start('HEADPHONES', 'CABLE');
    });
    monitor.mockResolvedValue({ ...emptyInputMonitor, state: 'RUNNING' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(201);
    });
    expect(result.current.status).toBe('ERROR');
    expect(stop).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('cancel_calibration_measurement', {
      request: { schemaVersion: 1, measurementId: id },
    });
  });
  it('유선 준비 조회 중 취소한 뒤 늦은 응답은 출력을 시작하지 않는다', async () => {
    const { wrapper, input, calibration, monitor } = harness();
    let resolve = () => {};
    monitor.mockReturnValue(
      new Promise((done) => {
        resolve = () => done(emptyInputMonitor);
      }),
    );
    const { result } = renderHook(
      () => useCalibrationMeasurement(input, calibration),
      { wrapper },
    );
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.start('HEADPHONES', 'CABLE');
    });
    await act(async () => {
      await result.current.cancel();
    });
    await act(async () => {
      resolve();
      await pending;
    });
    expect(CalibrationClickClock.prototype.start).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('명시적 시작 이후 실제 서버 표본만 표시하고 측정 ID로 저장한다', async () => {
    const { wrapper, input, calibration, stop } = harness();
    const { result } = renderHook(
      () => useCalibrationMeasurement(input, calibration),
      { wrapper },
    );
    expect(invoke).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.start('HEADPHONES');
    });
    expect(result.current.snapshot?.sampleCount).toBe(8);
    expect(result.current.active).toBe(true);
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.status).toBe('SAVED');
    expect(stop).toHaveBeenCalled();
    expect(calibration.applySaved).toHaveBeenCalledWith({
      schemaVersion: 1,
      revision: 1,
      profiles: [],
    });
    expect(invoke).toHaveBeenCalledWith('save_measured_calibration', {
      request: { schemaVersion: 1, measurementId: id, expectedRevision: 0 },
    });
  });
  it('입력 세대 변경은 클릭과 서버 측정을 취소한다', async () => {
    const { wrapper, input, calibration, stop } = harness();
    const { result, rerender } = renderHook(
      ({ input }) => useCalibrationMeasurement(input, calibration),
      { wrapper, initialProps: { input } },
    );
    await act(async () => {
      await result.current.start('HEADPHONES');
    });
    await act(async () => {
      rerender({
        input: { ...input, state: { ...input.state, streamGeneration: 2 } },
      });
    });
    expect(result.current.status).toBe('CANCELED');
    expect(stop).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('cancel_calibration_measurement', {
      request: { schemaVersion: 1, measurementId: id },
    });
  });
  it('늦은 준비 완료가 취소한 측정을 다시 시작하지 않는다', async () => {
    const { wrapper, input, calibration } = harness();
    let ready: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      ready = resolve;
    });
    vi.spyOn(CalibrationClickClock.prototype, 'start').mockReturnValue(pending);
    const { result } = renderHook(
      () => useCalibrationMeasurement(input, calibration),
      { wrapper },
    );
    let start: Promise<void> | undefined;
    await act(async () => {
      start = result.current.start('HEADPHONES');
    });
    await act(async () => {
      await result.current.cancel();
      ready();
      await start;
    });
    expect(result.current.status).toBe('CANCELED');
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(
          ([command]) => command === 'start_calibration_measurement',
        ),
    ).toBe(false);
  });
  it('출력 준비가 멈춰도90초 후 취소하고 늦은 완료를 버린다', async () => {
    const { wrapper, input, calibration } = harness();
    let ready: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      ready = resolve;
    });
    vi.spyOn(CalibrationClickClock.prototype, 'start').mockReturnValue(pending);
    const { result } = renderHook(
      () => useCalibrationMeasurement(input, calibration),
      { wrapper },
    );
    let start: Promise<void> | undefined;
    await act(async () => {
      start = result.current.start('HEADPHONES');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90000);
      ready();
      await start;
    });
    expect(result.current.status).toBe('CANCELED');
    expect(result.current.error).toContain('시간이 초과');
  });
  it('저장 도중 취소 요청은 완료된 저장을 취소라고 표시하지 않는다', async () => {
    const { wrapper, input, calibration } = harness();
    const original = vi.mocked(invoke).getMockImplementation();
    let saved: (value: unknown) => void = () => {};
    const pending = new Promise<unknown>((resolve) => {
      saved = resolve;
    });
    vi.mocked(invoke).mockImplementation((command, args, options) => {
      if (command === 'save_measured_calibration') return pending;
      if (!original) throw new Error('fixture 구현 없음');
      return original(command, args, options);
    });
    const { result } = renderHook(
      () => useCalibrationMeasurement(input, calibration),
      { wrapper },
    );
    await act(async () => {
      await result.current.start('HEADPHONES');
    });
    let save: Promise<void> | undefined;
    await act(async () => {
      save = result.current.save();
      await result.current.cancel();
    });
    expect(result.current.status).toBe('SAVING');
    await act(async () => {
      saved({ schemaVersion: 1, revision: 1, profiles: [] });
      await save;
    });
    expect(result.current.status).toBe('SAVED');
  });
});
