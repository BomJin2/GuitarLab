import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CalibrationPanel } from './CalibrationPanel';
import type { CalibrationController } from './useCalibration';
import type { MeasurementController } from './useCalibrationMeasurement';
import { emptyAudioSnapshot } from '../practice/audioInput';
it('측정 중 수동 저장을 막고 서버 추정이 있는 경우만 측정값을 저장한다', () => {
  const calibration: CalibrationController = {
    document: { schemaVersion: 1, revision: 0, profiles: [] },
    status: 'IDLE',
    error: null,
    load: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    applySaved: vi.fn(),
  };
  const measurement: MeasurementController = {
    status: 'COLLECTING',
    active: true,
    error: null,
    clock: '보정 동기화 안정',
    snapshot: {
      schemaVersion: 1,
      measurementId: '00000000-0000-4000-8000-000000000001',
      state: 'COLLECTING',
      sampleCount: 8,
      estimate: {
        biasRealMs: 30,
        jitterRealMs: 2,
        samplesUsed: 8,
        samplesRejected: 0,
      },
      estimateErrorCode: null,
    },
    start: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
  };
  const input = {
    ...emptyAudioSnapshot,
    state: 'RUNNING' as const,
    bufferFrames: 480,
  };
  const { rerender } = render(
    <CalibrationPanel
      input={input}
      native
      calibration={calibration}
      measurement={measurement}
    />,
  );
  expect(screen.getByRole('button', { name: '수동 보정 저장' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByLabelText('관측 지연 ms')).toHaveProperty(
    'disabled',
    true,
  );
  expect(
    screen.getByRole('button', { name: '보정값 다시 읽기' }),
  ).toHaveProperty('disabled', false);
  expect(screen.getByRole('button', { name: '측정값 저장' })).toHaveProperty(
    'disabled',
    false,
  );
  fireEvent.click(screen.getByRole('button', { name: '측정값 저장' }));
  expect(measurement.save).toHaveBeenCalledOnce();
  rerender(
    <CalibrationPanel
      input={input}
      native
      calibration={calibration}
      measurement={{ ...measurement, snapshot: null }}
    />,
  );
  expect(screen.getByRole('button', { name: '측정값 저장' })).toHaveProperty(
    'disabled',
    true,
  );
});
