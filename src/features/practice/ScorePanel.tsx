import { useEffect, useState } from 'react';
import { Panel } from '../../components/ui/Panel';
import { difficultySettings, type PracticeEvent } from './practice';
import type { PracticeController } from './usePractice';

function eventLabel(event: PracticeEvent) {
  if (event.feedback) return 'WRONG NOTE · 같은 음표 재시도 가능';
  const result = event.finalOutcome;
  if (!result) return '';
  if (result.outcome.kind === 'NOT_SCORED')
    return `${result.outcome.reason} · 감점 제외`;
  return `${result.outcome.judgement} · ${result.outcome.detail.replace('_', ' ')}${result.deltaRealMs === null ? '' : ` ${Math.abs(result.deltaRealMs).toFixed(1)} ms`}`;
}
export function ScorePanel({ practice }: { practice?: PracticeController }) {
  const [flash, setFlash] = useState(false);
  const id = practice?.snapshot?.attemptId;
  const sequence = practice?.snapshot?.eventSequence;
  useEffect(() => {
    setFlash(Boolean(sequence));
    const timer = window.setTimeout(() => setFlash(false), 500);
    return () => window.clearTimeout(timer);
  }, [id, sequence]);
  if (!practice)
    return (
      <Panel title="판정 프리뷰 · DEMO">
        <dl className="score-stats">
          <dt>SCORE</dt>
          <dd>085,400</dd>
          <dt>COMBO</dt>
          <dd>128</dd>
        </dl>
        <p className="cool">COOL · 98</p>
        <p className="good">GOOD · 25</p>
        <p className="miss">MISS · 5</p>
        <p>예시 수치입니다. 실제 입력과 채점은 연결되지 않았습니다.</p>
      </Panel>
    );
  const { snapshot, settings } = practice;
  const event = snapshot?.events.at(-1);
  const judgement = event?.finalOutcome?.outcome;
  const color =
    judgement?.kind === 'JUDGED' ? judgement.judgement.toLowerCase() : '';
  return (
    <Panel title="단음 판정">
      <p role="status">{practice.waiting}</p>
      <div className="toolbar">
        <button
          disabled={practice.armed || Boolean(practice.unavailable)}
          onClick={practice.start}
        >
          채점 시작
        </button>
        <button disabled={!practice.armed} onClick={practice.stop}>
          채점 중단
        </button>
      </div>
      {practice.unavailable && <p>{practice.unavailable}</p>}
      {practice.error && <p role="alert">{practice.error}</p>}
      <dl className="score-stats">
        <dt>SCORE</dt>
        <dd>{snapshot?.score.toLocaleString() ?? '—'}</dd>
        <dt>COMBO</dt>
        <dd>{snapshot?.combo ?? '—'}</dd>
      </dl>
      <p className="cool">COOL · {snapshot?.cool ?? '—'}</p>
      <p className="good">GOOD · {snapshot?.good ?? '—'}</p>
      <p className="miss">MISS · {snapshot?.miss ?? '—'}</p>
      <p>
        감점 제외 {snapshot?.excluded ?? '—'} · 정확도{' '}
        {snapshot?.accuracy == null ? '—' : `${snapshot.accuracy.toFixed(1)}%`}
      </p>
      <p>
        최고 콤보 {snapshot?.maxCombo ?? '—'} · 대상{' '}
        {snapshot?.targetCount ?? '—'}음
      </p>
      <div
        className={`judgement-feedback ${color} ${flash ? 'judgement-flash' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {event ? eventLabel(event) : '기타의 공격 음을 기다립니다'}
      </div>
      {snapshot && (
        <p>
          시도 epoch {snapshot.playbackEpoch} · {snapshot.rate}× · 적용 보정{' '}
          {snapshot.calibrationProfile.biasRealMs.toFixed(2)} ms
        </p>
      )}
      <details>
        <summary>채점 조건</summary>
        <label>
          모니터 환경
          <select
            aria-label="채점 모니터 환경"
            disabled={practice.armed}
            value={practice.environment}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === 'HEADPHONES' ||
                value === 'SPEAKERS' ||
                value === 'OTHER'
              )
                practice.setEnvironment(value);
            }}
          >
            <option value="HEADPHONES">헤드폰</option>
            <option value="SPEAKERS">스피커</option>
            <option value="OTHER">기타</option>
          </select>
        </label>
        <div className="toolbar">
          {Object.entries(difficultySettings).map(([name, value]) => (
            <button
              key={name}
              disabled={practice.armed}
              onClick={() => practice.setSettings(value)}
            >
              {name}
            </button>
          ))}
        </div>
        <label>
          COOL 허용 ms
          <input
            type="number"
            min="5"
            max="250"
            disabled={practice.armed}
            value={settings.coolMs}
            onChange={(event) =>
              practice.setSettings({
                ...settings,
                coolMs: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          GOOD 허용 ms
          <input
            type="number"
            min={settings.coolMs}
            max="500"
            disabled={practice.armed}
            value={settings.goodMs}
            onChange={(event) =>
              practice.setSettings({
                ...settings,
                goodMs: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          음정 허용 cents
          <input
            type="number"
            min="10"
            max="100"
            disabled={practice.armed}
            value={settings.pitchToleranceCents}
            onChange={(event) =>
              practice.setSettings({
                ...settings,
                pitchToleranceCents: Number(event.target.value),
              })
            }
          />
        </label>
      </details>
      <details>
        <summary>이번 실행의 이전 시도 ({practice.history.length}/20)</summary>
        <p>
          {practice.persistent
            ? '최근 시도 목록은 이번 실행의 표시입니다. 저장된 전체 기록은 결과 화면에서 다시 열 수 있습니다.'
            : '이 시도는 메모리에만 유지됩니다. 프로젝트 악보를 저장하면 이후 시도를 영구 기록합니다.'}
        </p>
        <ol>
          {practice.history.map((item) => (
            <li key={item.attemptId}>
              epoch {item.playbackEpoch} · {item.rate}× · {item.score}점 · 제외{' '}
              {item.excluded} · {item.state}
            </li>
          ))}
        </ol>
      </details>
      <p>
        깨끗한 단음용 PoC입니다. 화음·미지원 주법·저신뢰·중단 구간은 제외합니다.
        실제 줄·프렛은 검출하지 않습니다. 녹음 상태는 별도의 입력 녹음 패널을
        확인하세요.
      </p>
    </Panel>
  );
}
