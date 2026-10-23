import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  emptyInputMonitor,
  inputMonitorApi,
  type InputMonitorSnapshot,
} from './monitoring';
import { useInputMonitor } from './useInputMonitor';
vi.mock('./monitoring', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./monitoring')>();
  return {
    ...actual,
    inputMonitorApi: {
      status: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      volume: vi.fn(),
      outputs: vi.fn(),
    },
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  vi.mocked(inputMonitorApi.outputs).mockResolvedValue([]);
});
const running: InputMonitorSnapshot = {
  ...emptyInputMonitor,
  state: 'RUNNING',
  sessionId: 1,
  inputGeneration: 7,
  outputDeviceId: 'out',
  outputName: 'SSL',
  channels: 2,
  sampleRate: 48000,
};
const outputs = [
  {
    id: 'other',
    name: '다른 출력',
    channels: 2,
    sampleRate: 48000,
    sampleFormat: 'f32',
    isDefault: false,
  },
  {
    id: 'out',
    name: 'PC 기본',
    channels: 2,
    sampleRate: 48000,
    sampleFormat: 'f32',
    isDefault: true,
  },
];
it('PC 기본 출력은 선택하되 입력을 시작해도 기본 꺼짐이며 수동 끄기를 유지한다', async () => {
  vi.mocked(inputMonitorApi.outputs).mockResolvedValue(outputs);
  vi.mocked(inputMonitorApi.status).mockResolvedValue(emptyInputMonitor);
  vi.mocked(inputMonitorApi.start).mockImplementation(async () => {
    vi.mocked(inputMonitorApi.status).mockResolvedValue(running);
    return running;
  });
  vi.mocked(inputMonitorApi.stop).mockImplementation(async () => {
    vi.mocked(inputMonitorApi.status).mockResolvedValue(emptyInputMonitor);
    return emptyInputMonitor;
  });
  const hook = renderHook<ReturnType<typeof useInputMonitor>, number | null>(
    (generation) => useInputMonitor(true, generation),
    { initialProps: null },
  );
  await waitFor(() => expect(hook.result.current.selectedOutput).toBe('out'));
  expect(inputMonitorApi.start).not.toHaveBeenCalled();
  hook.rerender(7);
  await act(async () => {
    await new Promise((done) => setTimeout(done, 250));
  });
  expect(hook.result.current.enabled).toBe(false);
  expect(inputMonitorApi.start).not.toHaveBeenCalled();
  act(() => hook.result.current.enable());
  await waitFor(() => expect(hook.result.current.state.state).toBe('RUNNING'));
  expect(inputMonitorApi.start).toHaveBeenCalledExactlyOnceWith(7, 'out', 0.25);
  await act(async () => {
    await hook.result.current.stop();
  });
  hook.rerender(8);
  await act(async () => {
    await new Promise((done) => setTimeout(done, 250));
  });
  expect(inputMonitorApi.start).toHaveBeenCalledTimes(1);
  expect(hook.result.current.enabled).toBe(false);
});
it('직접 켠 뒤 연결 실패를 반복하지 않고 수동 출력 선택과 새로고침을 존중한다', async () => {
  vi.mocked(inputMonitorApi.outputs).mockResolvedValue(outputs);
  vi.mocked(inputMonitorApi.status).mockResolvedValue(emptyInputMonitor);
  vi.mocked(inputMonitorApi.start).mockRejectedValue({
    code: 'MONITOR_FORMAT_UNSUPPORTED',
  });
  const hook = renderHook(() => useInputMonitor(true, 7));
  act(() => hook.result.current.enable());
  await waitFor(() => expect(hook.result.current.error).toBeTruthy());
  await act(async () => {
    await new Promise((done) => setTimeout(done, 250));
  });
  expect(inputMonitorApi.start).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.selectOutput('other'));
  await waitFor(() => expect(inputMonitorApi.start).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  await act(async () => {
    await hook.result.current.refresh();
  });
  await waitFor(() => expect(inputMonitorApi.start).toHaveBeenCalledTimes(3));
  expect(hook.result.current.selectedOutput).toBe('other');
});
it('기본 출력이 없으면 첫 장치를 임의 선택/시작하지 않는다', async () => {
  vi.mocked(inputMonitorApi.outputs).mockResolvedValue(
    outputs.filter((device) => !device.isDefault),
  );
  vi.mocked(inputMonitorApi.status).mockResolvedValue(emptyInputMonitor);
  const hook = renderHook(() => useInputMonitor(true, 7));
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  act(() => hook.result.current.enable());
  expect(hook.result.current.selectedOutput).toBe('');
  expect(inputMonitorApi.start).not.toHaveBeenCalled();
});
it('초기 목록을 읽되 입력 전 자동 시작하지 않고 늦은 상태가 명시적 시작을 덮어쓰지 않는다', async () => {
  let resolve: (value: InputMonitorSnapshot) => void = () => {
    throw new Error('초기화 필요');
  };
  const old = new Promise<InputMonitorSnapshot>((done) => {
    resolve = done;
  });
  vi.mocked(inputMonitorApi.status)
    .mockReturnValueOnce(old)
    .mockResolvedValue(running);
  vi.mocked(inputMonitorApi.start).mockResolvedValue(running);
  const { result } = renderHook(() => useInputMonitor(true));
  expect(inputMonitorApi.start).not.toHaveBeenCalled();
  expect(inputMonitorApi.outputs).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.start(7, 'out');
  });
  await act(async () => {
    resolve(emptyInputMonitor);
  });
  expect(result.current.state.state).toBe('RUNNING');
});
it('연속 음량 조작은 마지막 값을 적용하고 실패 시 무한 재시도하지 않는다', async () => {
  vi.mocked(inputMonitorApi.status).mockResolvedValue(running);
  vi.mocked(inputMonitorApi.volume).mockImplementation(async (_id, volume) => {
    const next = { ...running, volume };
    vi.mocked(inputMonitorApi.status).mockResolvedValue(next);
    return next;
  });
  const { result } = renderHook(() => useInputMonitor(true));
  await waitFor(() => expect(result.current.state.state).toBe('RUNNING'));
  act(() => {
    result.current.setVolume(0.3);
    result.current.setVolume(0.4);
    result.current.setVolume(0.5);
  });
  await waitFor(() =>
    expect(inputMonitorApi.volume).toHaveBeenCalledWith(1, 0.5),
  );
  await waitFor(() => expect(result.current.state.volume).toBe(0.5));
  vi.mocked(inputMonitorApi.status).mockResolvedValue({
    ...running,
    volume: 0.5,
  });
  vi.mocked(inputMonitorApi.volume).mockRejectedValue({
    code: 'MONITOR_CHANGED',
  });
  act(() => result.current.setVolume(0.6));
  await waitFor(() => expect(result.current.error).toContain('변경'));
  expect(result.current.volume).toBe(0.5);
  const count = vi.mocked(inputMonitorApi.volume).mock.calls.length;
  await act(async () => {
    await new Promise((done) => setTimeout(done, 350));
  });
  expect(inputMonitorApi.volume).toHaveBeenCalledTimes(count);
});
it('비네이티브에서는 조회·출력·시작 명령을 실행하지 않는다', async () => {
  const { result } = renderHook(() => useInputMonitor(false));
  await act(async () => {
    await result.current.start(7, 'out');
  });
  expect(inputMonitorApi.status).not.toHaveBeenCalled();
  expect(inputMonitorApi.start).not.toHaveBeenCalled();
});
