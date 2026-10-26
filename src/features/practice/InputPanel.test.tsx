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
