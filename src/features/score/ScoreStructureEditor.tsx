import { useState } from 'react';
import type { ScoreDocument } from '../../entities/score';
import type { ScoreEditingController } from './useScoreEditing';
import { editorBars } from './normalizedNotation';

export function ScoreStructureEditor({
  document,
  trackId,
  editor,
  locked,
}: {
  document: ScoreDocument;
  trackId: string;
  editor: ScoreEditingController;
  locked: boolean;
}) {
  const bars = editorBars(document);
  const [selected, setSelected] = useState(0);
  const [resetSync, setResetSync] = useState(false);
  const index = Math.min(selected, bars.length - 1);
  const bar = bars[index];
  const track = document.tracks.find((t) => t.id === trackId);
  if (!bar || !track) return null;
  const tempo =
    [...document.tempoMap].reverse().find((t) => t.tick <= bar.start)?.bpm ??
    120;
  return (
    <section aria-label="마디와 튜닝 편집">
      <h3>마디·템포·튜닝</h3>
      <form
        key={`name:${track.id}:${track.name}`}
        onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get('trackName');
          if (typeof name === 'string')
            editor.structure({ kind: 'SET_TRACK_NAME', trackId, name });
        }}
      >
        <fieldset disabled={locked}>
          <legend>선택 트랙 이름</legend>
          <label>
            트랙 이름
            <input
              aria-label="악보 트랙 이름"
              name="trackName"
              required
              maxLength={400}
              defaultValue={track.name}
            />
          </label>
          <button>트랙 이름 적용</button>
        </fieldset>
      </form>
      <fieldset disabled={locked}>
        <legend>마디 선택</legend>
        <select
          aria-label="편집할 마디"
          value={index}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {bars.map((b, i) => (
            <option key={i} value={i}>
              {i + 1}마디 · {b.numerator}/{b.denominator} · tick {b.start}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={resetSync}
            onChange={(e) => setResetSync(e.target.checked)}
          />
          마디/템포 변경 시 수동 싱크를 기본값으로 다시 만들고 반주 정렬을
          재확인하겠습니다.
        </label>
        <form
          key={`tempo:${index}:${tempo}`}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (resetSync)
              editor.structure({
                kind: 'SET_TEMPO',
                measureIndex: index,
                bpm: Number(data.get('bpm')),
                resetSync: true,
              });
          }}
        >
          <label>
            템포 BPM
            <input
              aria-label="마디 템포 BPM"
              name="bpm"
              type="number"
              min={10}
              max={600}
              step={1}
              required
              defaultValue={tempo}
            />
          </label>
          <button disabled={!resetSync}>선택 마디부터 템포 적용</button>
        </form>
        <form
          key={`signature:${index}:${bar.numerator}:${bar.denominator}`}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (resetSync)
              editor.structure({
                kind: 'SET_SIGNATURE',
                measureIndex: index,
                numerator: Number(data.get('numerator')),
                denominator: Number(data.get('denominator')),
                resetSync: true,
              });
          }}
        >
          <label>
            박자 분자
            <input
              aria-label="마디 박자 분자"
              name="numerator"
              type="number"
              min={1}
              max={32}
              step={1}
              required
              defaultValue={bar.numerator}
            />
          </label>
          <label>
            박자 분모
            <select
              aria-label="마디 박자 분모"
              name="denominator"
              defaultValue={bar.denominator}
            >
              {[1, 2, 4, 8, 16, 32].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!resetSync}>선택 마디 박자 적용</button>
        </form>
        <button
          disabled={!resetSync || bars.length >= 256}
          onClick={() =>
            editor.structure({
              kind: 'INSERT_MEASURE',
              measureIndex: index,
              resetSync: true,
            })
          }
        >
          선택 마디 앞에 빈 마디 삽입
        </button>
        <button
          disabled={!resetSync || bars.length >= 256}
          onClick={() =>
            editor.structure({
              kind: 'INSERT_MEASURE',
              measureIndex: bars.length,
              resetSync: true,
            })
          }
        >
          끝에 빈 마디 추가
        </button>
        <button
          disabled={!resetSync || bars.length <= 1}
          onClick={() =>
            editor.structure({
              kind: 'REMOVE_MEASURE',
              measureIndex: index,
              discardNotes: true,
              resetSync: true,
            })
          }
        >
          선택 마디와 그 음표 삭제
        </button>
        <p>
          마디 삭제는 해당 마디의 모든 트랙 음표를 함께 제거합니다. 줄어든
          박자에 음표가 넘치면 적용하지 않습니다. 되돌리기로 이전 싱크와 음표를
          복원할 수 있습니다.
        </p>
      </fieldset>
      <form
        key={`tuning:${track.id}:${track.tuningMidi.join(',')}`}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          editor.structure({
            kind: 'SET_TUNING',
            trackId,
            tuningMidi: track.tuningMidi.map((_, i) =>
              Number(data.get(`string-${i}`)),
            ),
          });
        }}
      >
        <fieldset disabled={locked}>
          <legend>선택 트랙 튜닝 ·1번 줄부터 MIDI</legend>
          {track.tuningMidi.map((pitch, i) => (
            <label key={i}>
              {i + 1}번 줄
              <input
                aria-label={`튜닝 ${i + 1}번 줄 MIDI`}
                name={`string-${i}`}
                type="number"
                min={0}
                max={127}
                step={1}
                required
                defaultValue={pitch}
              />
            </label>
          ))}
          <button>프렛을 유지하고 튜닝 적용</button>
          <p>
            표준 튜닝은1번 줄부터64,59,55,50,45,40입니다. 튜닝을 바꾸면 같은
            프렛의 목표 음정도 바뀝니다.
          </p>
        </fieldset>
      </form>
    </section>
  );
}
