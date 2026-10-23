import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { tunerReading } from './tuner';
import { TunerDisplay } from './TunerDisplay';
import { emptyAudioSnapshot } from './audioInput';

describe('단음 튜너', () => {
  it('개방현과 A4의 음 이름·Hz를 실제 pitch에서 계산한다', () => {
    for (const [midi, note, hz] of [
      [40, 'E2', 82.4069],
      [45, 'A2', 110],
      [50, 'D3', 146.8324],
      [55, 'G3', 195.9977],
      [59, 'B3', 246.9417],
      [64, 'E4', 329.6276],
      [69, 'A4', 440],
    ] as const) {
      const reading = tunerReading(midi, 0.99);
      expect(reading?.note).toBe(note);
      expect(reading?.frequencyHz).toBeCloseTo(hz, 3);
      expect(reading?.direction).toBe('CENTER');
    }
  });
  it('cents 방향과 중앙 기준을 구별한다', () => {
    expect(tunerReading(40.25, 1)?.cents).toBeCloseTo(25);
    expect(tunerReading(40.25, 1)?.direction).toBe('HIGH');
    expect(tunerReading(39.75, 1)?.direction).toBe('LOW');
    expect(tunerReading(40.04, 1)?.direction).toBe('CENTER');
  });
  it('무입력·저신뢰·잘못된 pitch는 음 이름으로 표시하지 않는다', () => {
    for (const [pitch, confidence] of [
      [null, null],
      [40, 0.2],
      [NaN, 1],
      [Infinity, 1],
      [-1, 1],
      [40, 2],
    ] as const)
      expect(tunerReading(pitch, confidence)).toBeNull();
  });
  it('입력 정지 후 이전 음을 계속 표시하지 않는다', () => {
    const { rerender } = render(
      <TunerDisplay
        state={{
          ...emptyAudioSnapshot,
          state: 'RUNNING',
          pitchMidi: 40,
          confidence: 0.99,
        }}
      />,
    );
    expect(screen.getByText('E2')).toBeTruthy();
    rerender(
      <TunerDisplay
        state={{
          ...emptyAudioSnapshot,
          state: 'ERROR',
          pitchMidi: 40,
          confidence: 0.99,
        }}
      />,
    );
    expect(screen.queryByText('E2')).toBeNull();
    expect(
      screen.getByText('입력을 시작하면 검출 음을 표시합니다'),
    ).toBeTruthy();
  });
});
