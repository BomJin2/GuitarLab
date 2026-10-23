import { useRef } from 'react';

export function PreparationCountdown({
  remainingMs,
  onCancel,
}: {
  remainingMs: number;
  onCancel: () => void;
}) {
  const durationMs = useRef(Math.max(1, remainingMs));
  if (!Number.isFinite(remainingMs) || remainingMs < 0) return null;
  const seconds = Math.ceil(remainingMs / 1000);
  const progress = Math.min(
    1,
    Math.max(0, 1 - remainingMs / durationMs.current),
  );
  return (
    <section className="preparation-overlay" aria-label="연주 준비">
      <div className="preparation-card">
        <h2>연주 준비</h2>
        <div className="preparation-dial">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle
              className="preparation-ring-track"
              cx="100"
              cy="100"
              r="86"
            />
            <circle
              className="preparation-ring-progress"
              cx="100"
              cy="100"
              r="86"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={100 * (1 - progress)}
            />
          </svg>
          <span
            key={seconds}
            className="preparation-number"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {seconds > 0 ? seconds : '시작'}
          </span>
        </div>
        <p>잠시 후 연주가 시작됩니다</p>
        <button onClick={onCancel}>준비 취소</button>
      </div>
    </section>
  );
}
