import { useMemo, useState } from 'react';
import type { midi } from '@coderline/alphatab';
import type { SyncAnchor } from '../../entities/score';
import { usePlayer } from '../player/usePlayer';
import { scoreMeasureLoop } from './scoreMeasureLoop';

export function ScoreLoopPanel({
  lookup,
  anchors,
  locked,
}: {
  lookup: midi.MidiTickLookup;
  anchors: SyncAnchor[];
  locked: boolean;
}) {
  const { engine, state } = usePlayer();
  const [first, setFirst] = useState(0);
  const [last, setLast] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ready =
    !locked &&
    state.durationMs > 0 &&
    (state.status === 'paused' ||
      state.status === 'playing' ||
      state.status === 'countIn');
  const options = useMemo(
    () =>
      lookup.masterBars.map((bar, index) => (
        <option key={index} value={index}>
          {bar.masterBar.index + 1}마디 · 재생 순서 {index + 1}
        </option>
      )),
    [lookup],
  );
  return (
    <section className="panel" aria-label="마디 반복 설정">
      <h2>마디 반복</h2>
      <p>끝 마디까지 반복합니다. 반복 기호가 있으면 재생 순서로 구분하세요.</p>
      <fieldset disabled={!ready} className="toolbar">
        <label>
          시작 마디
          <select
            aria-label="반복 시작 마디"
            value={first}
            onChange={(event) => setFirst(Number(event.target.value))}
          >
            {options}
          </select>
        </label>
        <label>
          끝 마디
          <select
            aria-label="반복 끝 마디"
            value={last}
            onChange={(event) => setLast(Number(event.target.value))}
          >
            {options}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            if (!ready) return;
            try {
              const loop = scoreMeasureLoop(
                lookup,
                anchors,
                first,
                last,
                engine.getSnapshot().durationMs,
              );
              engine.pause();
              engine.setLoop(loop);
              engine.seek(loop.startMs);
              setError(null);
            } catch {
              setError(
                '시작·끝 마디와 싱크를 확인하세요. 반복은 음원 안의 250ms 이상 범위여야 합니다.',
              );
            }
          }}
        >
          선택 마디 반복
        </button>
        <button
          type="button"
          disabled={!state.loop}
          onClick={() => {
            if (!ready) return;
            engine.setLoop(null);
            setError(null);
          }}
        >
          반복 해제
        </button>
      </fieldset>
      {!ready && (
        <p>로컬 음원을 준비하고 녹음·파일 작업을 마친 뒤 설정하세요.</p>
      )}
      <p role="status">
        {state.loop
          ? `현재 반복: ${state.loop.startMs.toFixed(1)}~${state.loop.endMs.toFixed(1)} ms`
          : '반복 꺼짐'}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
