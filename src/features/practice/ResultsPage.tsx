import { EmptyState } from '../../components/ui/EmptyState';
import { useEffect, useMemo, useState } from 'react';
import type { ProjectController } from '../library/useProjects';
import {
  bestComparable,
  previousComparable,
  measureResults,
  timingHistogram,
  type StoredAttempt,
} from './records';
import { usePracticeEvents } from './usePracticeEvents';
import { usePracticeRecords } from './usePracticeRecords';
const statusText: Record<StoredAttempt['state'], string> = {
  RUNNING: '진행 중',
  FINISHED: '완료',
  STOPPED: '사용자 중단',
  INVALIDATED: '입력·동기화·저장 오류',
  INTERRUPTED: '앱 종료로 중단',
};
export function ResultsPage({ project }: { project: ProjectController }) {
  const [projectId, setProjectId] = useState(project.details?.project.id ?? '');
  const { records, busy, error, refresh } = usePracticeRecords(
    project.native,
    projectId,
  );
  const [selection, setSelection] = useState<{
    records: StoredAttempt[];
    id: string;
  } | null>(null);
  useEffect(() => {
    if (!projectId && project.projects[0]) setProjectId(project.projects[0].id);
  }, [projectId, project.projects]);
  const selected =
    (selection?.records === records
      ? records.find((r) => r.attemptId === selection.id)
      : undefined) ?? records[0];
  const eventRead = usePracticeEvents(selected);
  const events = eventRead.events;
  const measures = useMemo(() => measureResults(events), [events]);
  const bins = useMemo(() => timingHistogram(events), [events]);
  const best = selected ? bestComparable(records, selected) : null;
  const previous = selected ? previousComparable(records, selected) : null;
  const maximumBin = Math.max(1, ...bins.map((b) => b.count));
  const changedConditions = selected
    ? records.filter((r) => r.configFingerprint !== selected.configFingerprint)
        .length
    : 0;
  return (
    <>
      <h1>연습·연주 결과</h1>
      {!project.native && (
        <p>영구 기록 조회는 데스크톱 앱에서 사용할 수 있습니다.</p>
      )}
      <div className="toolbar">
        <label>
          프로젝트{' '}
          <select
            aria-label="결과 프로젝트"
            value={projectId}
            disabled={busy}
            onChange={(e) => {
              setProjectId(e.target.value);
            }}
          >
            <option value="">프로젝트 선택</option>
            {project.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!project.native || busy} onClick={refresh}>
          기록 새로고침
        </button>
      </div>
      {busy && <p role="status">저장 기록을 읽는 중입니다.</p>}
      {error && <p role="alert">{error}</p>}
      {project.native &&
        projectId &&
        !busy &&
        !error &&
        records.length === 0 && (
          <EmptyState
            title="아직 저장된 연습 기록이 없습니다"
            description="프로젝트 악보를 저장한 뒤 채점을 시작하면 실제 시도·판정이 기록됩니다."
          />
        )}
      {records.length > 0 && (
        <label>
          연습 시도{' '}
          <select
            aria-label="저장된 연습 시도"
            value={selected?.attemptId ?? ''}
            onChange={(e) => {
              setSelection({ records, id: e.target.value });
            }}
          >
            {records.map((r) => (
              <option key={r.attemptId} value={r.attemptId}>
                {new Date(r.startedAtMs).toLocaleString('ko-KR')} ·{' '}
                {r.snapshot.score.toLocaleString()}점 · {r.snapshot.rate}× ·{' '}
                {statusText[r.state]}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && (
        <>
          <section className="panel">
            <h2>
              {statusText[selected.state]} ·{' '}
              {selected.snapshot.score.toLocaleString()}점
            </h2>
            <p>
              COOL {selected.snapshot.cool} · GOOD {selected.snapshot.good} ·
              MISS {selected.snapshot.miss} · 감점 제외{' '}
              {selected.snapshot.excluded}
            </p>
            <p>
              최고 콤보 {selected.snapshot.maxCombo} · 정확도{' '}
              {selected.snapshot.accuracy?.toFixed(1) ?? '—'}% · 대상{' '}
              {selected.snapshot.targetCount}음
            </p>
            <p>
              {selected.snapshot.rate}× · 보정{' '}
              {selected.snapshot.calibrationProfile.biasRealMs.toFixed(2)} ms ·
              트랙 {selected.trackId} · {selected.scoringVersion}
            </p>
            {selected.state !== 'FINISHED' && (
              <p>
                완료하지 않은 시도입니다. 저장된 확정 구간만 표시하며 최고 기록
                비교에서 제외합니다.
              </p>
            )}
            {best && (
              <p>
                동일 조건 최고 기록: {best.snapshot.score.toLocaleString()}점 ·
                동점은 먼저 완료된 시도를 유지합니다.
              </p>
            )}
            {previous &&
              selected.snapshot.accuracy !== null &&
              previous.snapshot.accuracy !== null && (
                <p>
                  직전 동일 조건 시도 대비: 점수{' '}
                  {selected.snapshot.score - previous.snapshot.score >= 0
                    ? '+'
                    : ''}
                  {selected.snapshot.score - previous.snapshot.score}점 · 정확도{' '}
                  {selected.snapshot.accuracy - previous.snapshot.accuracy >= 0
                    ? '+'
                    : ''}
                  {(
                    selected.snapshot.accuracy - previous.snapshot.accuracy
                  ).toFixed(1)}
                  %p
                </p>
              )}
            {changedConditions > 0 && (
              <p>
                설정·보정·악보 버전·구간이 다른 {changedConditions}개 시도는
                최고 기록 비교에서 제외했습니다.
              </p>
            )}
            <details>
              <summary>기록 식별자</summary>
              <p>
                시도 {selected.attemptId} · 세션 {selected.sessionId} · 악보
                버전 {selected.revisionId}
              </p>
            </details>
          </section>
          {eventRead.status === 'LOADING' && (
            <p role="status">
              전체 판정 읽는 중 · {eventRead.loaded}/
              {selected.snapshot.eventSequence}
              <button onClick={eventRead.cancel}>기록 조회 취소</button>
            </p>
          )}
          {eventRead.status === 'CANCELLED' && (
            <p role="status">판정 조회를 취소했습니다.</p>
          )}
          {eventRead.error && <p role="alert">{eventRead.error}</p>}
          {(eventRead.status === 'CANCELLED' ||
            eventRead.status === 'ERROR') && (
            <button onClick={eventRead.retry}>판정 다시 읽기</button>
          )}
          {eventRead.status === 'READY' && (
            <>
              <section className="panel">
                <h2>마디별 정확도</h2>
                <p>COOL 1, GOOD 0.5 가중치이며 감점 제외는 분모에서 뺍니다.</p>
                {measures.length === 0 ? (
                  <p>확정된 음표 기록이 없습니다.</p>
                ) : (
                  <div className="measure-heatmap">
                    {measures.map((m) => (
                      <article
                        key={m.measureIndex}
                        className={
                          m.accuracy === null
                            ? 'neutral'
                            : m.accuracy >= 80
                              ? 'cool'
                              : m.accuracy >= 50
                                ? 'good'
                                : 'miss'
                        }
                      >
                        <strong>
                          {m.measureIndex + 1}마디 ·{' '}
                          {m.accuracy?.toFixed(1) ?? '—'}%
                        </strong>
                        <p>
                          COOL {m.cool} / GOOD {m.good} / MISS {m.miss} / 제외{' '}
                          {m.excluded}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section className="panel">
                <h2>타이밍 편차</h2>
                <p>
                  음정이 맞은 COOL/GOOD의 실제 ms 편차만 표시합니다. 음수 EARLY,
                  양수 LATE입니다.
                </p>
                <ul className="timing-histogram">
                  {bins.map((bin) => (
                    <li key={bin.label}>
                      <span>
                        {bin.label} · {bin.count}회
                      </span>
                      <div
                        aria-hidden="true"
                        style={{ width: `${(100 * bin.count) / maximumBin}%` }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
      <a className="button-link" href="#/practice">
        연습 화면으로 이동
      </a>
    </>
  );
}
