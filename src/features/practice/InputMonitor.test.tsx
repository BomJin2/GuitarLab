import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { InputMonitor } from './InputMonitor';
import { emptyAudioSnapshot } from './audioInput';
import {
  emptyInputMonitor,
  inputMonitorApi,
  type InputMonitorSnapshot,
} from './monitoring';
import type { AudioInputController } from './useAudioInput';
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
it('목록·PC 기본 출력은 바로 준비하되 입력 시작만으로 소리를 내지 않고 직접 켜고 끈다', async () => {
  const input: AudioInputController = {
    state: emptyAudioSnapshot,
    native: true,
    devices: [],
    devicesLoaded: true,
    busy: false,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
  };
  let snapshot: InputMonitorSnapshot = emptyInputMonitor;
  vi.mocked(inputMonitorApi.status).mockImplementation(async () => snapshot);
  vi.mocked(inputMonitorApi.outputs).mockResolvedValue([
    {
      id: 'out',
      name: 'SSL Output',
      channels: 2,
      sampleRate: 48000,
      sampleFormat: 'f32',
      isDefault: true,
    },
  ]);
  vi.mocked(inputMonitorApi.start).mockImplementation(
    async () =>
      (snapshot = {
        ...emptyInputMonitor,
        state: 'RUNNING',
        sessionId: 1,
        inputGeneration: 7,
        outputDeviceId: 'out',
        outputName: 'SSL Output',
        sampleRate: 48000,
        channels: 2,
      }),
  );
  vi.mocked(inputMonitorApi.stop).mockImplementation(
    async () => (snapshot = emptyInputMonitor),
  );
  const view = render(<InputMonitor input={input} />);
  await screen.findByRole('option', { name: 'SSL Output · PC 기본 출력' });
  expect(screen.getByRole('combobox', { name: '모니터 출력' })).toHaveProperty(
    'value',
    'out',
  );
  expect(inputMonitorApi.start).not.toHaveBeenCalled();
  expect(input.start).not.toHaveBeenCalled();
  view.rerender(
    <InputMonitor
      input={{
        ...input,
        state: { ...emptyAudioSnapshot, state: 'RUNNING', streamGeneration: 7 },
      }}
    />,
  );
  expect(inputMonitorApi.start).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '🎧 모니터 켜기' }));
  });
  await waitFor(() =>
    expect(inputMonitorApi.start).toHaveBeenCalledWith(7, 'out', 0.25),
  );
  await screen.findByText(/모니터 켜짐 · SSL Output/);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '🎧 모니터 끄기' }));
  });
  expect(inputMonitorApi.stop).toHaveBeenCalledOnce();
  expect(input.stop).not.toHaveBeenCalled();
});
