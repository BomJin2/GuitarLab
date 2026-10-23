import { useEffect, useState } from 'react';
import type { AudioSnapshot } from '../practice/audioInput';
import { currentProfile, type MonitorEnvironment } from './calibration';
import type { CalibrationController } from './useCalibration';
import type { MeasurementController } from './useCalibrationMeasurement';

const measurementLabels: Record<MeasurementController['status'], string> = {
  IDLE: '반복 연주 보정 대기',
  SYNCING: '시간 동기화 준비 중',
  COLLECTING: '단음 입력 측정 중',
  READY: '측정값 확인 후 저장할 수 있습니다',
  SAVING: '측정값 저장 중',
  STOPPING: '클릭과 측정 종료 중',
  SAVED: '측정한 보정값을 로컬에 저장했습니다',
  CANCELED: '측정을 취소했습니다',
  ERROR: '측정을 완료하지 못했습니다',
};

export function CalibrationPanel({
  input,
  native,
  calibration,
  measurement,
}: {
  input: AudioSnapshot;
  native: boolean;
  calibration: CalibrationController;
  measurement: MeasurementController;
}) {
  const [environment, setEnvironment] =
    useState<MonitorEnvironment>('HEADPHONES');
  const selected = currentProfile(calibration.document, input, environment);
  const [bias, setBias] = useState(selected?.biasRealMs ?? 0);
  useEffect(() => {
    setBias(selected?.biasRealMs ?? 0);
  }, [
    selected,
    input.deviceId,
    input.sampleRate,
    input.sampleFormat,
    input.channels,
    input.channelIndex,
    input.bufferFrames,
    environment,
  ]);
  const busy =
    calibration.status === 'LOADING' || calibration.status === 'SAVING';
  return (
    <section className="panel" aria-label="입력 지연 보정">
      <h2>입력 지연 보정</h2>
      <p>
        양수는 늦게 관측된 입력을 앞당깁니다. 실제 시간 ms 기준이며 배속을
        반영합니다. 현재 장치·채널·샘플레이트·버퍼·출력 환경이 같을 때만
        저장값을 사용합니다.
      </p>
      {!native ? (
        <p>보정값 저장은 Windows 앱에서 사용할 수 있습니다.</p>
      ) : (
        <>
          <div className="toolbar">
            <label>
              출력 환경
              <select
                aria-label="출력 환경"
                disabled={busy || measurement.active}
                value={environment}
                onChange={(event) =>
                  setEnvironment(
                    event.target.value === 'SPEAKERS'
                      ? 'SPEAKERS'
                      : event.target.value === 'OTHER'
                        ? 'OTHER'
                        : 'HEADPHONES',
                  )
                }
              >
                <option value="HEADPHONES">헤드폰</option>
                <option value="SPEAKERS">스피커</option>
                <option value="OTHER">기타</option>
              </select>
            </label>
            <label>
              관측 지연 ms
              <input
                aria-label="관측 지연 ms"
                type="number"
                min={-500}
                max={500}
                step={1}
                value={bias}
                disabled={busy || measurement.active}
                onChange={(event) => setBias(Number(event.target.value))}
              />
            </label>
            <button
              disabled={
                busy ||
                measurement.active ||
                input.state !== 'RUNNING' ||
                input.bufferFrames === null ||
                !Number.isFinite(bias) ||
                Math.abs(bias) > 500
              }
              onClick={() =>
                void calibration.save(bias, environment, input.streamGeneration)
              }
            >
              수동 보정 저장
            </button>
            <button
              disabled={
                busy ||
                measurement.status === 'SAVING' ||
                measurement.status === 'STOPPING'
              }
              onClick={() => void calibration.load()}
            >
              보정값 다시 읽기
            </button>
          </div>
          <p>
            {selected
              ? selected.method === 'MANUAL'
                ? `현재 설정 저장값 ${selected.biasRealMs} ms · 수동 입력`
                : `현재 설정 저장값 ${selected.biasRealMs.toFixed(2)} ms · 반복 측정 ${selected.samplesUsed}회 · 흔들림 ${selected.jitterRealMs.toFixed(2)} ms`
              : '현재 설정에 저장된 보정값이 없습니다.'}
          </p>
          <p role="status">
            {calibration.status === 'LOADING'
              ? '설정 읽는 중'
              : calibration.status === 'SAVING'
                ? '원자적으로 저장 중'
                : calibration.status === 'SAVED'
                  ? '보정값을 로컬에 저장했습니다.'
                  : '보정 설정 준비'}
          </p>
          {calibration.error && <p role="alert">{calibration.error}</p>}
          <h3>클릭에 맞춰 반복 연주로 측정</h3>
          <p>
            헤드폰으로 16회 클릭을 듣고 같은 줄의 단음을 짧게 튕긴 뒤
            끊어주세요. 기존 반주는 일시정지하며 음원은 유지합니다. 유효 표본8회
            이상일 때 저장할 수 있습니다.
          </p>
          <div className="toolbar">
            <button
              disabled={
                busy ||
                measurement.active ||
                input.state !== 'RUNNING' ||
                input.bufferFrames === null
              }
              onClick={() => void measurement.start(environment)}
            >
              반복 연주 보정 시작
            </button>
            <button
              disabled={
                !measurement.active ||
                measurement.status === 'SAVING' ||
                measurement.status === 'STOPPING'
              }
              onClick={() => void measurement.cancel()}
            >
              보정 측정 취소
            </button>
            <button
              disabled={
                busy ||
                !measurement.active ||
                !measurement.snapshot?.estimate ||
                measurement.status === 'SAVING' ||
                measurement.status === 'STOPPING'
              }
              onClick={() => void measurement.save()}
            >
              측정값 저장
            </button>
          </div>
          <p role="status">
            {measurementLabels[measurement.status]} · 수집 표본{' '}
            {measurement.snapshot?.sampleCount ?? 0}/16회
          </p>
          <p>{measurement.clock}</p>
          {measurement.snapshot?.estimate && (
            <p>
              관측 지연 {measurement.snapshot.estimate.biasRealMs.toFixed(2)} ms
              · 흔들림 {measurement.snapshot.estimate.jitterRealMs.toFixed(2)}{' '}
              ms · 유효 {measurement.snapshot.estimate.samplesUsed}회 · 이상치
              제외 {measurement.snapshot.estimate.samplesRejected}회
            </p>
          )}
          {measurement.snapshot?.estimateErrorCode && (
            <p>유효 표본이 부족하거나 이상치가 많습니다. 다시 측정하세요.</p>
          )}
          {measurement.error && <p role="alert">{measurement.error}</p>}
        </>
      )}
      <p>
        관측값에는 출력 지연·사용자 박자 반응·입력 지연이 함께 포함됩니다. 한
        박자의 절반(375ms)을 넘는 지연은 다른 박자로 대응될 수 있어 수동값으로
        보완하세요. 출력 장치나 모니터 환경이 바뀌면 다시 측정하세요. 실시간
        채점은 연습/연주 화면의 ‘채점 시작’으로 활성화합니다. 실제 기타 채점
        검증은 진행 중입니다.
      </p>
    </section>
  );
}
