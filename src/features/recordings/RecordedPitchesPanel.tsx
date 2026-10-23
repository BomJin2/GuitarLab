import { pitchReading } from '../../shared/pitch';
import type { RecordedTake } from './recordings';
import { pitchWarningLabels } from './recordedPitches';
import {
  motionLabels,
  trackWarningLabels,
  type RecordedPitchTrack,
} from './recordedPitchTrack';
import { useRecordedPitches } from './useRecordedPitches';

export function RecordedPitchesPanel({ take }: { take: RecordedTake }) {
  const state = useRecordedPitches(take);
  return (
    <section className="panel" aria-label="녹음 다성 음정 진단">
      <h2>녹음 구간 음정 후보 · 실험</h2>
      <p>
        선택한 테이크의{state.mode === 'TRACK' ? '1초' : '400ms'}를 로컬에서
        읽습니다. 코드 정답·줄·프렛 판정이 아니며 점수에는 반영하지 않습니다.
        녹음을 새로 만들거나 원본을 바꾸지 않습니다.
      </p>
      <label>
        분석 방식{' '}
        <select
          value={state.mode}
          disabled={state.busy}
          onChange={(e) => {
            if (e.target.value === 'TRACK' || e.target.value === 'SPECTRAL')
              state.changeMode(e.target.value);
          }}
        >
          <option value="SPECTRAL">다성 음정 후보 ·400ms</option>
          <option value="TRACK">단음 음정 변화 ·1초</option>
        </select>
      </label>
      <label>
        분석 시작 ms{' '}
        <input
          type="number"
          min={0}
          max={30000}
          step={100}
          value={state.startText}
          disabled={state.busy}
          onChange={(e) => state.changeStart(e.target.value)}
        />
      </label>
      <button
        disabled={!state.native || !!state.reason || state.busy}
        onClick={() => void state.analyze()}
      >
        선택 구간 음정 분석
      </button>
      <button disabled={!state.busy || state.canceling} onClick={state.cancel}>
        구간 분석 취소
      </button>
      {!state.native && <p>Windows 앱에서 분석할 수 있습니다.</p>}
      {state.reason && <p>{state.reason}</p>}
      {state.busy && (
        <p role="status">
          {state.canceling ? '분석 취소 처리 중' : '구간 분석 중'} ·{' '}
          {state.job?.completedBytes ?? 0}/{state.job?.totalBytes ?? 0}바이트
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.result?.method === 'MONOPHONIC_TRACK_EXPERIMENTAL' && (
        <TrackResult result={state.result} />
      )}
      {state.result?.method === 'SPECTRAL_PEAK_EXPERIMENTAL' && (
        <>
          <p role="status">
            {state.result.state === 'CANDIDATES'
              ? '실험적 음정 후보'
              : state.result.state === 'SILENT'
                ? '무음·낮은 입력'
                : '분석 보류'}{' '}
            · {state.result.startMs.toFixed(1)}~
            {(state.result.startMs + state.result.durationMs).toFixed(1)}ms ·{' '}
            {state.result.rmsDbfs.toFixed(1)}dBFS
          </p>
          <ul>
            {state.result.pitches.map((pitch) => {
              const reading = pitchReading(pitch.midi);
              return (
                reading && (
                  <li key={pitch.midi}>
                    {reading.note} · {reading.frequencyHz.toFixed(2)}Hz ·{' '}
                    {reading.cents.toFixed(1)}cents · 상대 강도{' '}
                    {pitch.salience.toFixed(3)}
                  </li>
                )
              );
            })}
          </ul>
          <ul>
            {state.result.warnings.map((warning) => (
              <li key={warning}>{pitchWarningLabels[warning]}</li>
            ))}
          </ul>
          <p>
            상대 강도는 스펙트럼 진폭의 비율이며 정답 신뢰도·확률이 아닙니다.
            소리가 지속되는 구간에서 비교하세요. 특히 낮은 음의 배음과 겹치는
            높은 음은 누락될 수 있습니다.
          </p>
        </>
      )}
    </section>
  );
}

function TrackResult({ result }: { result: RecordedPitchTrack }) {
  return (
    <>
      <p role="status">
        {motionLabels[result.motion]} · {result.startMs.toFixed(1)}~
        {(result.startMs + 1000).toFixed(1)}ms · 유효 구간{' '}
        {(result.coverage * 100).toFixed(1)}%
      </p>
      <p>
        순 음정 변화{' '}
        {result.deltaCents === null ? '—' : result.deltaCents.toFixed(1)}cents ·
        최소 주기성{' '}
        {result.minConfidence === null ? '—' : result.minConfidence.toFixed(3)}
      </p>
      <ul>
        {result.warnings.map((warning) => (
          <li key={warning}>{trackWarningLabels[warning]}</li>
        ))}
      </ul>
      {result.oscillation && (
        <p>
          흔들림 속도 {result.oscillation.rateHz.toFixed(1)}Hz · 관측 깊이{' '}
          {result.oscillation.depthCents.toFixed(1)}cents · 관측 반복 약{' '}
          {result.oscillation.cycles.toFixed(1)}회 · 곡선 적합도{' '}
          {(result.oscillation.fit * 100).toFixed(1)}%. 비브라토 주법 확인이나
          정답 확률이 아닙니다.
        </p>
      )}
      <p>
        주기성은 반복 파형의 일치도이며 정답 확률이 아닙니다.1초 안에서 소리가
        지속되는 단음을 사용하세요. 분석창 평균 때문에 관측된 흔들림 깊이는 실제
        변화보다 작을 수 있습니다.
      </p>
      <details>
        <summary>음정 변화 분석 지점 ({result.points.length})</summary>
        <ol>
          {result.points.map((point) => {
            const reading =
              point.pitchMidi === null ? null : pitchReading(point.pitchMidi);
            return (
              <li key={point.timeMs}>
                {(result.startMs + point.timeMs).toFixed(1)}ms ·{' '}
                {reading
                  ? `${reading.note} · ${reading.frequencyHz.toFixed(2)}Hz · ${point.confidence?.toFixed(3)} 주기성`
                  : '유효 단음 후보 없음'}
              </li>
            );
          })}
        </ol>
      </details>
    </>
  );
}
