import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InputPanel } from './InputPanel';
import { emptyAudioSnapshot } from './audioInput';
import type { AudioInputController } from './useAudioInput';

function controller(): AudioInputController {
  return {
    native: true,
    state: emptyAudioSnapshot,
    devices: [
      {
        id: 'input1',
        name: 'SSL Input 1',
        channels: 1,
        sampleRate: 48000,
        sampleFormat: 'f32',
      },
    ],
    devicesLoaded: true,
    busy: false,
    error: null,
    refresh: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  };
}
describe('명시적 튜너 입력', () => {
  it('입력 중 화면에 재진입한 뒤 중단해도 실제 장치·채널·gate로 다시 시작할 수 있다', () => {
    const input = controller();
    const device = input.devices[0];
    if (!device) throw new Error('자체 장치 누락');
    device.channels = 2;
    input.state = {
      ...emptyAudioSnapshot,
      state: 'RUNNING',
      streamGeneration: 3,
      deviceId: 'input1',
      channels: 2,
      channelIndex: 1,
      sampleRate: 48000,
      noiseGateDbfs: -60,
    };
    const { rerender } = render(<InputPanel input={input} />);
    input.state = { ...input.state, state: 'STOPPED' };
    rerender(<InputPanel input={input} />);
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: '입력 장치' })
        .value,
    ).toBe('input1');
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: '입력 채널' })
        .value,
    ).toBe('1');
    fireEvent.click(
      screen.getByRole('button', { name: '선택 장치 입력 시작' }),
    );
    expect(input.start).toHaveBeenCalledWith('input1', 1, -60);
  });
  it('늦게 도착한 실제 입력 설정은 유지하고 중단 후 직접 수정은 상태 조회가 덮지 않는다', () => {
    const input = controller();
    const { rerender } = render(<InputPanel input={input} />);
    input.state = {
      ...emptyAudioSnapshot,
      state: 'RUNNING',
      streamGeneration: 4,
      deviceId: 'input1',
      channels: 1,
      sampleRate: 48000,
      noiseGateDbfs: -65,
    };
    rerender(<InputPanel input={input} />);
    expect(input.start).not.toHaveBeenCalled();
    input.state = { ...input.state, state: 'STOPPED' };
    const device = input.devices[0];
    if (!device) throw new Error('자체 장치 누락');
    input.devices.push({ ...device, id: 'input2', name: '다른 입력' });
    rerender(<InputPanel input={input} />);
    fireEvent.change(screen.getByRole('combobox', { name: '입력 장치' }), {
      target: { value: 'input2' },
    });
    fireEvent.change(
      screen.getByRole('spinbutton', { name: '노이즈 게이트 dBFS' }),
      { target: { value: '-40' } },
    );
    input.state = { ...input.state, capturedFrames: 48000 };
    rerender(<InputPanel input={input} />);
    fireEvent.click(
      screen.getByRole('button', { name: '선택 장치 입력 시작' }),
    );
    expect(input.start).toHaveBeenCalledWith('input2', 0, -40);
    input.state = { ...input.state, state: 'ERROR', noiseGateDbfs: -65 };
    rerender(<InputPanel input={input} />);
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: '입력 장치' })
        .value,
    ).toBe('input2');
    expect(
      screen.getByRole<HTMLInputElement>('spinbutton', {
        name: '노이즈 게이트 dBFS',
      }).value,
    ).toBe('-40');
  });
  it('재연결로 채널이 줄거나 장치가 없으면 임의 선택/시작 없이 다시 선택을 요구한다', () => {
    const input = controller();
    const device = input.devices[0];
    if (!device) throw new Error('자체 장치 누락');
    input.state = {
      ...emptyAudioSnapshot,
      deviceId: 'input1',
      channels: 2,
      channelIndex: 1,
      noiseGateDbfs: -60,
    };
    const { rerender } = render(<InputPanel input={input} />);
    const start = screen.getByRole('button', { name: '선택 장치 입력 시작' });
    expect(start.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/입력 장치의 채널 수가 바뀌었습니다/)).toBeTruthy();
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: '입력 채널' })
        .value,
    ).toBe('-1');
    fireEvent.change(screen.getByRole('combobox', { name: '입력 채널' }), {
      target: { value: '0' },
    });
    fireEvent.click(start);
    expect(input.start).toHaveBeenCalledWith('input1', 0, -60);
    vi.mocked(input.start).mockClear();
    input.devices = [{ ...device, id: 'different', name: '다른 입력' }];
    rerender(<InputPanel input={input} />);
    expect(start.hasAttribute('disabled')).toBe(true);
    fireEvent.click(start);
    expect(input.start).not.toHaveBeenCalled();
  });
  it('RMS가 낮아도 최대값 도달 이력을 표시하고 새 스트림과 중단 상태를 구분한다', () => {
    const input = controller();
    input.state = {
      ...emptyAudioSnapshot,
      state: 'RUNNING',
      levelDbfs: -3.01,
      capturedFrames: 48000,
      fullScaleFrames: 12,
    };
    const { rerender } = render(<InputPanel input={input} />);
    expect(screen.getByText(/디지털 최대값 도달·초과 12프레임/)).toBeTruthy();
    expect(screen.getByText(/입력 GAIN을 낮춰/)).toBeTruthy();
    expect(input.start).not.toHaveBeenCalled();
    input.state = { ...input.state, state: 'STOPPED' };
    rerender(<InputPanel input={input} />);
    expect(screen.queryByText(/입력 GAIN을 낮춰/)).toBeNull();
    input.state = { ...input.state, state: 'RUNNING', fullScaleFrames: 0 };
    rerender(<InputPanel input={input} />);
    expect(screen.queryByText(/입력 GAIN을 낮춰/)).toBeNull();
    expect(screen.getByText(/디지털 최대값 도달·초과 0프레임/)).toBeTruthy();
    const { fullScaleFrames: omitted, ...legacy } = input.state;
    expect(omitted).toBe(0);
    input.state = legacy;
    rerender(<InputPanel input={input} />);
    expect(screen.queryByText(/디지털 최대값 도달·초과/)).toBeNull();
    input.state = { ...legacy, levelDbfs: -0.2 };
    rerender(<InputPanel input={input} />);
    expect(screen.getByText(/입력 레벨이 높습니다/)).toBeTruthy();
    input.state = { ...input.state, fullScaleFrames: 12 };
    rerender(<InputPanel input={input} />);
    expect(screen.queryByText(/입력 레벨이 높습니다/)).toBeNull();
    expect(screen.getByText(/입력 GAIN을 낮춰/)).toBeTruthy();
  });
  it('사용자 장치 선택과 시작 버튼 전에는 캡처하지 않는다', () => {
    const input = controller();
    render(<InputPanel input={input} />);
    expect(
      screen
        .getByRole('button', { name: '선택 장치 입력 시작' })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: '입력 장치' }), {
      target: { value: 'input1' },
    });
    expect(input.start).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: '선택 장치 입력 시작' }),
    );
    expect(input.start).toHaveBeenCalledWith('input1', 0, -50);
  });
  it('화면 재진입 시 실제 장치·채널·gate를 표시하고 중단을 전달한다', () => {
    const input = controller();
    input.state = {
      ...emptyAudioSnapshot,
      state: 'RUNNING',
      deviceId: 'input1',
      channels: 1,
      sampleRate: 48000,
      noiseGateDbfs: -60,
      pitchMidi: 40,
      confidence: 0.99,
    };
    render(<InputPanel input={input} />);
    expect(
      screen
        .getByRole('combobox', { name: '입력 장치' })
        .getAttribute('disabled'),
    ).toBe('');
    expect(
      screen
        .getByRole('spinbutton', { name: '노이즈 게이트 dBFS' })
        .getAttribute('value'),
    ).toBe('-60');
    expect(screen.getByText('E2')).toBeTruthy();
    expect(screen.getByText('사용 중: SSL Input 1 · 채널 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '입력 중단' }));
    expect(input.stop).toHaveBeenCalledOnce();
  });
});
