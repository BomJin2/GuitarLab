import { useCallback, useEffect, useState } from 'react';
import { usePlayer } from './usePlayer';
function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
type CountInChoice = 'off' | 'threeSeconds' | 'oneBar' | 'twoBars';
export function TransportBar({
  workspace,
  preparePlayback = false,
  locked = false,
}: {
  workspace: boolean;
  preparePlayback?: boolean;
  locked?: boolean;
}) {
  const { engine, state } = usePlayer();
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(2000);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (state.loop) {
      setStart(state.loop.startMs);
      setEnd(state.loop.endMs);
    }
  }, [state.loop]);
  const [countInChoice, setCountInChoice] = useState<CountInChoice | null>(
    null,
  );
  const choice = countInChoice ?? (preparePlayback ? 'threeSeconds' : 'off');
  const startPlayback = useCallback(() => {
    if (choice === 'threeSeconds') void engine.prepare();
    else
      void engine.countIn(
        choice === 'oneBar' ? 1 : choice === 'twoBars' ? 2 : 0,
      );
  }, [choice, engine]);
  const ready = !locked && state.durationMs > 0 && state.status !== 'loading';
  const playing = state.status === 'playing' || state.status === 'countIn';
  const togglePlayback = () => {
    if (locked) return;
    const latest = engine.getSnapshot();
    if (latest.status === 'playing' || latest.status === 'countIn')
      engine.pause();
    else startPlayback();
  };
  const toggleLoop = () => {
    try {
      engine.setLoop(
        engine.getSnapshot().loop ? null : { startMs: start, endMs: end },
      );
      setError(null);
    } catch {
      setError('반복 구간은 음원 안의 250ms 이상 범위여야 합니다.');
    }
  };
  useEffect(() => {
    if (!workspace || locked) return;
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            'input,textarea,select,button,a,summary,[contenteditable="true"],[role="separator"]',
          ))
      )
        return;
      const snapshot = engine.getSnapshot();
      if (!snapshot.durationMs || snapshot.status === 'loading') return;
      if (event.key === ' ') {
        event.preventDefault();
        if (snapshot.status === 'playing' || snapshot.status === 'countIn')
          engine.pause();
        else startPlayback();
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        engine.seek(
          Math.max(
            0,
            Math.min(
              snapshot.durationMs,
              snapshot.audioTimeMs + (event.key === 'ArrowLeft' ? -5000 : 5000),
            ),
          ),
        );
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        try {
          engine.setLoop(snapshot.loop ? null : { startMs: start, endMs: end });
          setError(null);
        } catch {
          setError('반복 구간을 확인하세요.');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [engine, workspace, startPlayback, start, end, locked]);
  return (
    <footer className="transport" aria-label="재생 컨트롤">
      <fieldset disabled={locked} className="transport-fields">
        <button disabled={!ready} onClick={togglePlayback}>
          {locked
            ? '녹음 중 · 재생 잠김'
            : !ready
              ? '▶ 재생 · 준비 중'
              : playing
                ? '일시정지'
                : '▶ 재생'}
        </button>
        <button
          disabled={!ready}
          onClick={() => {
            engine.pause();
            engine.seek(0);
          }}
        >
          정지
        </button>
        <label className="timeline-label">
          재생 위치
          <input
            aria-label="재생 위치"
            type="range"
            min="0"
            max={state.durationMs || 100}
            step="10"
            value={state.audioTimeMs}
            disabled={!ready}
            onChange={(event) => engine.seek(Number(event.target.value))}
          />
        </label>
        <span>
          {formatTime(state.audioTimeMs)} / {formatTime(state.durationMs)}
        </span>
        {workspace && (
          <>
            <label>
              배속
              <select
                aria-label="배속"
                disabled={!ready}
                value={state.rate}
                onChange={(event) => engine.setRate(Number(event.target.value))}
              >
                {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary>반복 / 박자 / 믹서</summary>
              <div className="transport-options">
                <label>
                  A ms
                  <input
                    type="number"
                    value={start}
                    onChange={(event) => setStart(Number(event.target.value))}
                  />
                </label>
                <label>
                  B ms
                  <input
                    type="number"
                    value={end}
                    onChange={(event) => setEnd(Number(event.target.value))}
                  />
                </label>
                <button
                  disabled={!ready}
                  aria-pressed={!!state.loop}
                  onClick={toggleLoop}
                >
                  반복 {state.loop ? '끄기' : '켜기'}
                </button>
                <p>
                  {state.loop
                    ? `적용한 반복: ${state.loop.startMs}~${state.loop.endMs} ms`
                    : '반복 꺼짐'}
                </p>
                <label>
                  카운트인
                  <select
                    value={choice}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (
                        value === 'off' ||
                        value === 'threeSeconds' ||
                        value === 'oneBar' ||
                        value === 'twoBars'
                      )
                        setCountInChoice(value);
                    }}
                  >
                    <option value="off">끄기</option>
                    <option value="threeSeconds">3초 준비</option>
                    <option value="oneBar">1마디</option>
                    <option value="twoBars">2마디</option>
                  </select>
                </label>
                <p>
                  {state.timing.bpm.toFixed(1)} BPM · {state.timing.numerator}/
                  {state.timing.denominator} · {state.rate}× 반영
                </p>
                <button
                  aria-pressed={state.metronomeEnabled}
                  onClick={() =>
                    void engine.setMetronome(!state.metronomeEnabled)
                  }
                >
                  메트로놈 {state.metronomeEnabled ? '끄기' : '켜기'}
                </button>
                <label>
                  메트로놈 음량
                  <input
                    aria-label="메트로놈 음량"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={state.metronomeVolume}
                    onChange={(event) =>
                      engine.setMetronomeVolume(Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  원곡 음량
                  <input
                    aria-label="원곡 음량"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={state.volume}
                    onChange={(event) =>
                      engine.setVolume(Number(event.target.value))
                    }
                  />
                </label>
                <p>
                  악보 트랙은 별도 분리 오디오가 아닙니다. 존재하는 원곡과
                  메트로놈만 제어합니다.
                </p>
                {error && <p role="alert">{error}</p>}
              </div>
            </details>
          </>
        )}
        <span role="status" className="transport-note">
          {state.error ??
            (state.status === 'countIn'
              ? `준비 ${Math.ceil(state.countInRemainingMs / 1000)}초`
              : state.status === 'loading'
                ? '음원 읽는 중'
                : '로컬 재생')}
        </span>
      </fieldset>
    </footer>
  );
}
