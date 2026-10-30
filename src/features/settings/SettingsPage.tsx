import { AiRuntimePanel } from '../transcription/AiRuntimePanel';
import { InputPanel } from '../practice/InputPanel';
import type { AudioInputController } from '../practice/useAudioInput';
import type { ClockState } from '../player/useCaptureClock';
import { CalibrationPanel } from './CalibrationPanel';
import { LocalBackupPanel } from './LocalBackupPanel';
import { LocalRestorePanel } from './LocalRestorePanel';
import { LocalDiagnosticsPanel } from './LocalDiagnosticsPanel';
import type { CalibrationController } from './useCalibration';
import type { MeasurementController } from './useCalibrationMeasurement';
export function SettingsPage({
  input,
  clock,
  calibration,
  measurement,
}: {
  input: AudioInputController;
  clock: ClockState;
  calibration: CalibrationController;
  measurement: MeasurementController;
}) {
  return (
    <>
      <h1 className="mb-8 text-2xl font-semibold">환경 설정</h1>
      <InputPanel input={input} clock={clock} />
      <CalibrationPanel
        input={input.state}
        native={input.native}
        calibration={calibration}
        measurement={measurement}
      />
      <AiRuntimePanel />
      <LocalBackupPanel />
      <LocalRestorePanel />
      <LocalDiagnosticsPanel />
    </>
  );
}
