import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectController } from '../library/useProjects';
import {
  recordingApi,
  recordingError,
  comparisonWarnings,
  type RecordedTake,
} from './recordings';
import { TakeReplay } from './TakeReplay';
import { RecordedPitchesPanel } from './RecordedPitchesPanel';
import { TakeExportPanel } from './TakeExportPanel';
import { LatestTask } from '../../shared/latestTask';
import type { JobSnapshot } from '../library/projects';
export function RecordingsPage({ project }: { project: ProjectController }) {
  const projectId = project.details?.project.id;
  const [takes, setTakes] = useState<RecordedTake[]>([]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [side, setSide] = useState<'A' | 'B'>('A');
  const [playRequest, setPlayRequest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const task = useRef(new LatestTask());
  const refresh = useCallback(async () => {
    if (!projectId) return;
    const current = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const result = await recordingApi.list(projectId);
      if (mounted.current && generation.current === current) setTakes(result);
    } catch (cause) {
      if (mounted.current && generation.current === current)
        setError(recordingError(cause));
    } finally {
      if (mounted.current && generation.current === current) setBusy(false);
    }
  }, [projectId]);
  useEffect(() => {
    mounted.current = true;
    setTakes([]);
    setA('');
    setB('');
    setSide('A');
    void refresh();
    const current = task.current;
    const listGeneration = generation;
    return () => {
      mounted.current = false;
      listGeneration.current++;
      current.cancel();
    };
  }, [refresh]);
  const takeA = takes.find((t) => t.id === a) ?? null;
  const takeB = takes.find((t) => t.id === b) ?? null;
  const selected = side === 'A' ? takeA : takeB;
  const peer = side === 'A' ? takeB : takeA;
  const warnings = takeA && takeB ? comparisonWarnings(takeA, takeB) : [];
  async function recover(take: RecordedTake) {
    setBusy(true);
    setError(null);
    const result = await task.current.run((signal) =>
      recordingApi.recover(take.projectId, take.id, signal, setJob),
    );
    if (!mounted.current) return;
    setBusy(false);
    if (result.status === 'error') setError(recordingError(result.error));
    else if (result.status === 'ready') void refresh();
  }
  return (
    <>
      <h1>녹음 테이크</h1>
      <p>
        프로젝트별 최대1000개 · 입력 전용 원본 WAV · 삭제/덮어쓰기 없이 새
        테이크로 보존합니다.
      </p>
      {!projectId ? (
        <p>라이브러리에서 저장된 프로젝트를 열어주세요.</p>
      ) : (
        <>
          <button disabled={busy} onClick={() => void refresh()}>
            테이크 새로고침
          </button>
          {busy && (
            <p role="status">
              테이크 처리 중{' '}
              {job ? `${job.completedBytes}/${job.totalBytes}` : ''}
              <button onClick={() => task.current.cancel()}>복구 취소</button>
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="toolbar">
            <label>
              A 테이크
              <select
                aria-label="A 테이크"
                value={a}
                onChange={(e) => {
                  setA(e.target.value);
                  if (e.target.value === b) setB('');
                  setSide('A');
                }}
              >
                <option value="">선택하세요</option>
                {takes
                  .filter((t) => t.state === 'READY')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {new Date(t.createdAtMs).toLocaleString()}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              B 테이크
              <select
                aria-label="B 테이크"
                value={b}
                onChange={(e) => setB(e.target.value)}
              >
                <option value="">선택하세요</option>
                {takes
                  .filter((t) => t.state === 'READY' && t.id !== a)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {new Date(t.createdAtMs).toLocaleString()}
                    </option>
                  ))}
              </select>
            </label>
            <button
              disabled={!takeA}
              aria-pressed={side === 'A'}
              onClick={() => {
                setSide('A');
                setPlayRequest((value) => value + 1);
              }}
            >
              A 듣기
            </button>
            <button
              disabled={!takeB}
              aria-pressed={side === 'B'}
              onClick={() => {
                setSide('B');
                setPlayRequest((value) => value + 1);
              }}
            >
              B 듣기
            </button>
          </div>
          {warnings.length > 0 && (
            <p role="alert">
              비교 조건 안내: {warnings.join(' · ')}. 동일 조건의 점수 비교로
              간주하지 않습니다.
            </p>
          )}
          {selected && (
            <TakeReplay take={selected} peer={peer} playRequest={playRequest} />
          )}
          {selected && (
            <TakeExportPanel
              key={`${selected.projectId}:${selected.id}:${selected.sha256}`}
              take={selected}
            />
          )}
          {selected && (
            <RecordedPitchesPanel
              key={`${selected.projectId}:${selected.id}`}
              take={selected}
            />
          )}
          {takes.length === 0 && (
            <p>저장된 테이크가 없습니다. 연주 화면에서 REC를 눌러주세요.</p>
          )}
          <div className="project-list">
            {takes.map((take) => (
              <TakeDetails
                key={take.id}
                take={take}
                busy={busy}
                onRecover={() => void recover(take)}
                onSave={async (name, memo, offset) => {
                  setBusy(true);
                  setError(null);
                  try {
                    await recordingApi.update(take, name, memo, offset);
                    await refresh();
                  } catch (cause) {
                    if (mounted.current) setError(recordingError(cause));
                  } finally {
                    if (mounted.current) setBusy(false);
                  }
                }}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
function TakeDetails({
  take,
  busy,
  onRecover,
  onSave,
}: {
  take: RecordedTake;
  busy: boolean;
  onRecover: () => void;
  onSave: (name: string, memo: string, offset: number) => Promise<void>;
}) {
  const [name, setName] = useState(take.name);
  const [memo, setMemo] = useState(take.memo);
  const [offset, setOffset] = useState(take.alignmentOffsetMs);
  return (
    <article className="panel">
      <h2>{take.name}</h2>
      <p>
        {take.state} · {(take.frames / take.sampleRate).toFixed(2)}초 ·{' '}
        {take.sampleRate}Hz / mono float32 · 누락 {take.droppedFrames}
      </p>
      <p>
        악보 {take.scoreRevisionId} · 트랙 {take.targetScoreTrackId} ·{' '}
        {take.transport?.rate ?? '무반주'}
        {take.transport ? '×' : ''} · 보정{' '}
        {take.calibration.biasRealMs.toFixed(2)}ms / {take.calibration.method}
      </p>
      <p>
        입력 채널 {take.calibration.key.channelIndex + 1} · 장치{' '}
        {take.calibration.key.deviceId} · 캡처 시작{' '}
        {take.captureStartSampleIndex ?? '미확인'} ·{' '}
        {new Date(take.createdAtMs).toLocaleString()}
      </p>
      {!!take.referenceTakeIds?.length && (
        <p>
          오버더빙 참조: {take.referenceTakeIds.join(' · ')} · 새 입력만 독립
          저장
        </p>
      )}
      {take.errorCode && (
        <p role="alert">
          {take.errorCode} · 복구한 테이크도 불완전 원본에서 얻은 데이터임을
          유지합니다.
        </p>
      )}
      <label>
        테이크 이름
        <input
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        메모
        <textarea
          value={memo}
          maxLength={2000}
          onChange={(e) => setMemo(e.target.value)}
        />
      </label>
      <label>
        정렬 오프셋 ms
        <input
          type="number"
          min={-60000}
          max={60000}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
        />
      </label>
      <button
        disabled={
          busy ||
          !name.trim() ||
          !Number.isFinite(offset) ||
          Math.abs(offset) > 60000
        }
        onClick={() => void onSave(name, memo, offset)}
      >
        테이크 정보 저장
      </button>
      {take.state === 'RECOVERABLE_ERROR' && (
        <button disabled={busy} onClick={onRecover}>
          원본 보존하여 복구
        </button>
      )}
    </article>
  );
}
