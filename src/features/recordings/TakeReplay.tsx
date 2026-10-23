import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PlayerEngine } from '../player/PlayerEngine';
import { usePlayerEngine } from '../player/usePlayer';
import { LatestTask } from '../../shared/latestTask';
import {
  recordingApi,
  recordingError,
  recordedSampleToSongMs,
  type RecordedTake,
} from './recordings';
import { projectApi, type JobSnapshot } from '../library/projects';
import { renderStoredScore } from '../score/normalizedNotation';
import type { ScoreSession } from '../score/scoreSession';
import { ScoreViewport } from '../score/ScoreViewport';
import { audioTimeToScoreTick } from '../player/sync';
import { logDiagnostic } from '../../shared/logger';
import { waveformPeaks } from './waveform';

export function TakeReplay({
  take,
  peer,
  playRequest = 0,
}: {
  take: RecordedTake;
  peer: RecordedTake | null;
  playRequest?: number;
}) {
  const main = usePlayerEngine();
  const [engine] = useState(() => new PlayerEngine());
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const task = useRef(new LatestTask());
  const [score, setScore] = useState<ScoreSession | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(1000);
  const [normalize, setNormalize] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const requested = useRef(playRequest);
  const autoPlay = useRef(false);
  const restore = useRef<{ song: number | null; time: number } | null>(null);
  const latest = useRef(take);
  const scoreTime = recordedSampleToSongMs(
    take,
    (state.audioTimeMs / 1000) * take.sampleRate,
  );
  useEffect(() => {
    engine.activate();
    return () => engine.dispose();
  }, [engine]);
  useEffect(() => {
    const previous = latest.current;
    if (previous.id !== take.id)
      restore.current = {
        song: recordedSampleToSongMs(
          previous,
          (engine.getSnapshot().audioTimeMs / 1000) * previous.sampleRate,
        ),
        time: engine.getSnapshot().audioTimeMs,
      };
    latest.current = take;
    main.pause();
    engine.pause();
    engine.clear();
    setScore(null);
    setPeaks([]);
    setLoading(true);
    setError(null);
    const current = task.current;
    let canceled = false;
    void current
      .run(async (signal) => {
        const bytes = await recordingApi.read(
          take.projectId,
          take.id,
          signal,
          setJob,
        );
        if (signal.aborted)
          throw new DOMException('불러오기 취소', 'AbortError');
        const peaks = waveformPeaks(bytes);
        let session: ScoreSession | null = null;
        let scoreError = false;
        try {
          const revision = await recordingApi.revision(take.projectId, take.id);
          if (revision.revisionId !== take.scoreRevisionId)
            throw new Error('RECORDING_CONTRACT_INVALID');
          const original = await projectApi.read(
            take.projectId,
            revision.scoreAssetId,
            signal,
            setJob,
          );
          const rendered = renderStoredScore(
            revision.score,
            new Uint8Array(original.data),
          );
          const index = revision.score.tracks.findIndex(
            (t) => t.id === take.targetScoreTrackId,
          );
          if (index < 0) throw new Error('RECORDING_CONTRACT_INVALID');
          session = {
            ...rendered,
            document: revision.score,
            originalBytes: new Uint8Array(original.data),
            activeTrackIndex: index,
            activePerformanceTrackId: take.targetScoreTrackId,
          };
        } catch (cause) {
          if (signal.aborted) throw cause;
          scoreError = true;
          logDiagnostic('warn', 'RECORDING_SCORE_UNAVAILABLE');
        }
        return { bytes, peaks, session, scoreError };
      })
      .then((result) => {
        if (canceled || result.status === 'canceled') return;
        setLoading(false);
        if (result.status === 'error') {
          setError(recordingError(result.error));
          return;
        }
        engine.load(new Blob([result.value.bytes], { type: 'audio/wav' }));
        setPeaks(result.value.peaks);
        setScore(result.value.session);
        if (result.value.scoreError)
          setError(
            '저장된 원본 악보를 읽지 못해 TAB 표시는 생략합니다. 녹음은 들을 수 있습니다.',
          );
        setClipStart(0);
        setClipEnd((take.frames / take.sampleRate) * 1000);
      })
      .catch(() => {
        if (!canceled) {
          setLoading(false);
          setError('녹음 준비 중 오류가 발생했습니다. 다시 선택하세요.');
        }
      });
    return () => {
      canceled = true;
      current.cancel();
      engine.pause();
    };
  }, [take, engine, main, loadAttempt]);
  useEffect(() => {
    if (requested.current !== playRequest) {
      requested.current = playRequest;
      autoPlay.current = true;
    }
    const current = engine.getSnapshot();
    if (
      autoPlay.current &&
      current.status === 'paused' &&
      current.durationMs > 0 &&
      !loading
    ) {
      autoPlay.current = false;
      void engine.play();
    }
  }, [engine, playRequest, state.status, state.durationMs, loading]);
  useEffect(() => {
    const current = engine.getSnapshot();
    if (
      current.status === 'paused' &&
      current.durationMs > 0 &&
      restore.current
    ) {
      const saved = restore.current;
      restore.current = null;
      const time =
        saved.song !== null && take.songStartMs !== null && take.transport
          ? (saved.song - take.songStartMs - take.alignmentOffsetMs) /
            take.transport.rate
          : saved.time;
      engine.seek(Math.max(0, Math.min(current.durationMs, time)));
    }
  }, [engine, state.status, state.durationMs, take]);
  const gain =
    normalize && peer && take.peak > 0 ? Math.min(1, peer.peak / take.peak) : 1;
  const playbackVolume = muted ? 0 : volume * gain;
  useEffect(() => {
    engine.setVolume(playbackVolume);
  }, [engine, playbackVolume]);
  const ready = !loading && state.durationMs > 0;
  return (
    <section className="panel" aria-label="테이크 재생">
      <h2>{take.name} 다시 듣기</h2>
      <button
        disabled={loading}
        onClick={() => setLoadAttempt((value) => value + 1)}
      >
        녹음 다시 불러오기
      </button>
      {loading && (
        <p role="status">
          녹음 읽는 중 · {job?.completedBytes.toLocaleString() ?? 0} /{' '}
          {job?.totalBytes.toLocaleString() ?? 0}바이트{' '}
          <button
            onClick={() => {
              task.current.cancel();
              setLoading(false);
              setError('불러오기를 취소했습니다. 다시 선택하면 재시도합니다.');
            }}
          >
            불러오기 취소
          </button>
        </p>
      )}
      {(error || state.error) && <p role="alert">{error ?? state.error}</p>}
      <svg
        viewBox="0 0 800 100"
        className="take-waveform"
        role="img"
        aria-label="실제 녹음 파형"
      >
        <line x1="0" y1="50" x2="800" y2="50" stroke="currentColor" />
        {peaks.map((peak, i) => (
          <line
            key={i}
            x1={(i / peaks.length) * 800}
            x2={(i / peaks.length) * 800}
            y1={50 - Math.min(1, peak) * 46}
            y2={50 + Math.min(1, peak) * 46}
            stroke="var(--color-accent)"
          />
        ))}
        <line
          x1={(state.audioTimeMs / Math.max(1, state.durationMs)) * 800}
          x2={(state.audioTimeMs / Math.max(1, state.durationMs)) * 800}
          y1="0"
          y2="100"
          stroke="var(--color-miss)"
        />
      </svg>
      <div className="toolbar">
        <button
          disabled={!ready}
          onClick={() => {
            if (state.status === 'playing') engine.pause();
            else void engine.play();
          }}
        >
          {state.status === 'playing' ? '테이크 일시정지' : '테이크 재생'}
        </button>
        <button
          disabled={!ready}
          onClick={() => {
            engine.pause();
            engine.seek(0);
          }}
        >
          테이크 정지
        </button>
        <label>
          녹음 위치
          <input
            aria-label="녹음 재생 위치"
            type="range"
            min={0}
            max={state.durationMs || 1}
            value={state.audioTimeMs}
            step={10}
            disabled={!ready}
            onChange={(e) => engine.seek(Number(e.target.value))}
          />
        </label>
        <span>
          {(state.audioTimeMs / 1000).toFixed(2)} /{' '}
          {(state.durationMs / 1000).toFixed(2)}초 · 악보{' '}
          {scoreTime === null ? '정렬 안 됨' : `${scoreTime.toFixed(1)}ms`}
        </span>
        <label>
          테이크 재생 음량
          <input
            aria-label="테이크 재생 음량"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            disabled={!ready}
            onChange={(event) => setVolume(Number(event.target.value) / 100)}
          />
        </label>
        <span>{Math.round(volume * 100)}%</span>
        <button
          aria-label="테이크 음소거"
          aria-pressed={muted}
          disabled={!ready}
          onClick={() => setMuted((value) => !value)}
        >
          {muted ? '음소거 해제' : '음소거'}
        </button>
      </div>
      <div className="toolbar">
        <label>
          부분 시작 ms
          <input
            type="number"
            value={clipStart}
            onChange={(e) => setClipStart(Number(e.target.value))}
          />
        </label>
        <label>
          부분 끝 ms
          <input
            type="number"
            value={clipEnd}
            onChange={(e) => setClipEnd(Number(e.target.value))}
          />
        </label>
        <button
          disabled={!ready}
          onClick={() => {
            try {
              engine.setLoop({ startMs: clipStart, endMs: clipEnd });
              engine.seek(clipStart);
              void engine.play();
              setError(null);
            } catch {
              setError('부분 재생은 녹음 안의250ms 이상 범위여야 합니다.');
            }
          }}
        >
          부분 반복 재생
        </button>
        <button disabled={!state.loop} onClick={() => engine.setLoop(null)}>
          부분 반복 끄기
        </button>
        <label>
          <input
            type="checkbox"
            checked={normalize}
            onChange={(e) => setNormalize(e.target.checked)}
          />
          A/B peak 음량 맞춤
        </label>
      </div>
      <p>
        A/B는 작은 peak 쪽으로 재생 음량을 줄여 맞춥니다(맞춤 배율{' '}
        {gain.toFixed(3)}· 최종 재생 {Math.round(playbackVolume * 100)}%).
        음량·음색 차이와 점수는 같은 의미가 아닙니다. WAV 원본은 변경하지
        않습니다.
      </p>
      {score && scoreTime !== null ? (
        <ScoreViewport
          score={score.score}
          lookup={score.playbackLookup}
          trackIndex={score.activeTrackIndex}
          tick={audioTimeToScoreTick(
            score.document.syncAnchors,
            Math.max(0, scoreTime),
          )}
        />
      ) : (
        <p>
          무반주/시각 미확인 테이크는 악보 정렬을 보장하지 않습니다. 수동
          오프셋은 정렬된 테이크의 표시 위치만 보정합니다.
        </p>
      )}
    </section>
  );
}
