import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  audioInput,
  emptyAudioSnapshot,
  type AudioSnapshot,
} from './audioInput';
import { useAudioInput } from './useAudioInput';

vi.mock('./audioInput', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./audioInput')>();
  return {
    ...actual,
    audioInput: {
      available: () => true,
      status: vi.fn(),
      devices: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
  };
});
afterEach(() => vi.clearAllMocks());
beforeEach(() => {
  vi.mocked(audioInput.devices).mockResolvedValue([]);
});
function pending<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('초기화 필요');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('입력 시작/중단 경합', () => {
  it('시작 이전의 늦은 상태 조회가 새 입력을 덮어쓰지 않는다', async () => {
    const old = pending<AudioSnapshot>();
    const running: AudioSnapshot = {
      ...emptyAudioSnapshot,
      state: 'RUNNING',
      deviceId: 'input1',
      sampleRate: 48000,
      channels: 1,
    };
    vi.mocked(audioInput.status)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(running);
    vi.mocked(audioInput.start).mockResolvedValue(running);
    const { result } = renderHook(() => useAudioInput());
    await act(async () => {
      await result.current.start('input1', 0, -50);
    });
    await act(async () => {
      old.resolve(emptyAudioSnapshot);
    });
    expect(result.current.state.state).toBe('RUNNING');
  });
  it('입력 시작 중 이중 명령을 차단하고 실패 후 다시 시작할 수 있다', async () => {
    const first = pending<AudioSnapshot>();
    vi.mocked(audioInput.status).mockResolvedValue(emptyAudioSnapshot);
    vi.mocked(audioInput.start)
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce({ code: 'AUDIO_PERMISSION_DENIED' })
      .mockResolvedValueOnce(emptyAudioSnapshot);
    const { result } = renderHook(() => useAudioInput());
    let start: Promise<void> | undefined;
    act(() => {
      start = result.current.start('input1', 0, -50);
    });
    await act(async () => {
      await result.current.start('input1', 0, -50);
    });
    expect(audioInput.start).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.resolve(emptyAudioSnapshot);
      await start;
    });
    await act(async () => {
      await result.current.start('input1', 0, -50);
    });
    expect(result.current.error).toContain('마이크 권한');
    await act(async () => {
      await result.current.start('input1', 0, -50);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });
  it('장치 조회가 캡처를 시작하지 않으며 빈 목록을 명시한다', async () => {
    vi.mocked(audioInput.status).mockResolvedValue(emptyAudioSnapshot);
    vi.mocked(audioInput.devices).mockResolvedValue([]);
    const { result } = renderHook(() => useAudioInput());
    await waitFor(() => expect(result.current.devicesLoaded).toBe(true));
    expect(audioInput.devices).toHaveBeenCalledTimes(1);
    expect(result.current.devices).toEqual([]);
    expect(audioInput.start).not.toHaveBeenCalled();
  });
  it('초기 장치 조회가 늦게 끝나도 수동 새로고침 결과를 덮어쓰지 않는다', async () => {
    vi.mocked(audioInput.status).mockResolvedValue(emptyAudioSnapshot);
    const old = pending<Awaited<ReturnType<typeof audioInput.devices>>>();
    vi.mocked(audioInput.devices)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue([]);
    const hook = renderHook(() => useAudioInput());
    await act(async () => {
      await hook.result.current.refresh();
    });
    await act(async () => {
      old.resolve([
        {
          id: 'stale',
          name: '이전 목록',
          channels: 1,
          sampleRate: 48000,
          sampleFormat: 'f32',
        },
      ]);
    });
    expect(hook.result.current.devices).toEqual([]);
    expect(audioInput.start).not.toHaveBeenCalled();
  });
  it('초기 목록 실패를 표시하고 수동 새로고침으로 복구한다', async () => {
    vi.mocked(audioInput.status).mockResolvedValue(emptyAudioSnapshot);
    vi.mocked(audioInput.devices)
      .mockRejectedValueOnce(new Error('실패'))
      .mockResolvedValue([]);
    const hook = renderHook(() => useAudioInput());
    await waitFor(() => expect(hook.result.current.error).toBeTruthy());
    await act(async () => {
      await hook.result.current.refresh();
    });
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.devicesLoaded).toBe(true);
  });
});
