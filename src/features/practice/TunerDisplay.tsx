import { tunerReading } from './tuner';
import type { AudioSnapshot } from './audioInput';

export function TunerDisplay({ state }: { state: AudioSnapshot }) {
  const reading =
    state.state === 'RUNNING'
      ? tunerReading(state.pitchMidi, state.confidence)
      : null;
  const direction = reading?.direction;
  return (
    <div className="tuner-display" aria-label="크로매틱 튜너">
      <div className="tuner-note">{reading?.note ?? '—'}</div>
      <p>
        {reading
          ? `${reading.frequencyHz.toFixed(2)} Hz · A4 = 440 Hz`
          : '한 음을 천천히 튕겨주세요'}
      </p>
      <div className="tuner-scale" aria-hidden="true">
        <span className="tuner-center" />
        {reading && (
          <span
            className={`tuner-needle ${direction === 'CENTER' ? 'in-tune' : ''}`}
            style={{ left: `${50 + reading.cents}%` }}
          />
        )}
      </div>
      <div className="tuner-labels" aria-hidden="true">
        <span>−50</span>
        <span>0 cents</span>
        <span>+50</span>
      </div>
      <p className={direction === 'CENTER' ? 'tuner-in-tune' : ''}>
        {reading
          ? `${reading.cents > 0 ? '+' : ''}${reading.cents.toFixed(1)} cents · ${direction === 'CENTER' ? '중앙 ±5 cents' : direction === 'LOW' ? '음이 낮습니다 · 줄을 조금 조이세요' : '음이 높습니다 · 줄을 조금 풀어주세요'}`
          : state.state === 'RUNNING'
            ? '입력이 없거나 단음 신뢰도가 부족합니다'
            : '입력을 시작하면 검출 음을 표시합니다'}
      </p>
      {reading && (
        <p>단음 검출 신뢰도 {Math.round(reading.confidence * 100)}%</p>
      )}
    </div>
  );
}
