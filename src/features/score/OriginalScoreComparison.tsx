import { useState } from 'react';
import type { midi, model } from '@coderline/alphatab';
import { ScoreViewport } from './ScoreViewport';

export function OriginalScoreComparison({
  score,
  lookup,
}: {
  score: model.Score;
  lookup: midi.MidiTickLookup;
}) {
  const [selected, setSelected] = useState(0);
  const index = score.tracks[selected] ? selected : 0;
  return (
    <section aria-label="읽기 전용 원본 비교">
      <h3>원본 악보 · 읽기 전용 · 시작 위치</h3>
      <label>
        원본 악보 트랙
        <select
          aria-label="원본 악보 트랙"
          value={index}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isInteger(value) && score.tracks[value])
              setSelected(value);
          }}
        >
          {score.tracks.map((track, i) => (
            <option key={i} value={i}>
              {i + 1} · {track.name}
            </option>
          ))}
        </select>
      </label>
      <p>편집본의 트랙 선택과 별도로 최초 원본을 확인합니다.</p>
      <ScoreViewport
        score={score}
        lookup={lookup}
        trackIndex={index}
        tick={0}
      />
    </section>
  );
}
