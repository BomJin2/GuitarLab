import { Fragment, useEffect, useState, type MouseEvent } from 'react';
import type { SyncAnchor } from '../../entities/score';
import { usePlayer } from '../player/usePlayer';
import { decodePeaks } from './dawWaveform';
import type { DawTrack } from './useDawTracks';

const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];

function clock(seconds: number) {
  const s = Math.round(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 파형 막대를 그립니다. from·to(0~1)는 보이는 구간입니다. */
function WavePath({
  peaks,
  from = 0,
  to = 1,
}: {
  peaks: number[];
  from?: number;
  to?: number;
}) {
  const n = Math.max(peaks.length, 1);
  return (
    <svg
      className="daw-wave"
      viewBox={`${from * n} -1 ${(to - from) * n} 2`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={peaks.map((p, i) => `M${i + 0.5} ${-p}V${p}`).join('')}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** 믹스 레이어 1개의 클립. 01번 음원 길이 밖은 잘라서 그립니다(docs/12 v2). */
function TrackClip({ track, duration }: { track: DawTrack; duration: number }) {
  const { startMs, lengthMs, peaks } = track;
  const note =
    startMs === null
      ? '곡 위치 없음'
      : peaks === undefined
        ? '파형을 준비하는 중입니다'
        : peaks === null
          ? '파형을 그릴 수 없습니다'
          : peaks === 'SKIPPED'
            ? '용량 제한으로 파형 생략'
            : null;
  if (startMs === null || lengthMs === null || lengthMs <= 0)
    return <span className="daw-note">{note}</span>;
  const from = Math.max(startMs, 0);
  const to = Math.min(startMs + lengthMs, duration);
  if (to <= from) return <span className="daw-note">재생 범위 밖</span>;
  return (
    <div
      className="daw-region"
      style={{
        left: `${(from / duration) * 100}%`,
        width: `${((to - from) / duration) * 100}%`,
      }}
    >
      {Array.isArray(peaks) ? (
        <WavePath
          peaks={peaks}
          from={(from - startMs) / lengthMs}
          to={(to - startMs) / lengthMs}
        />
      ) : (
        <span className="daw-note">{note}</span>
      )}
    </div>
  );
}

/** DAW 보기: 현재 재생 음원(01)과 프로젝트 믹스 레이어의 파형·초 눈금·싱크 깃발·재생 헤드(보기 전용, docs/12 v1·v2). */
export function DawTimeline({
  anchors,
  locked,
  tracks = [],
}: {
  anchors: SyncAnchor[] | null;
  locked: boolean;
  tracks?: DawTrack[];
}) {
  const { engine, state } = usePlayer();
  const source = engine.source;
  const [wave, setWave] = useState<{
    source: Blob;
    peaks: number[] | null;
  } | null>(null);
  useEffect(() => {
    if (!source) return;
    let live = true;
    decodePeaks(source).then(
      (result) => live && setWave({ source, peaks: result.peaks }),
      () => live && setWave({ source, peaks: null }),
    );
    return () => {
      live = false;
    };
  }, [source]);
  const duration = state.durationMs;
  if (!source || duration <= 0)
    return (
      <section className="daw" aria-label="DAW 타임라인">
        <p className="empty-note">
          {state.status === 'loading'
            ? '음원을 불러오는 중입니다'
            : '원곡 음원을 불러오면 파형과 싱크를 표시합니다'}
        </p>
      </section>
    );
  // undefined = 디코딩 중, null = 실패
  const peaks = wave?.source === source ? wave.peaks : undefined;
  const seconds = duration / 1000;
  const step = steps.find((s) => seconds / s <= 12) ?? 600;
  const ticks = Array.from(
    { length: Math.floor(seconds / step) + 1 },
    (_, i) => i * step,
  );
  const pct = (ms: number) =>
    `${(Math.min(Math.max(ms, 0), duration) / duration) * 100}%`;
  // 음원보다 뒤에 있는 앵커도 끝에 붙여 보여 줘야 사라진 것과 구분됩니다.
  const flags = (anchors ?? []).filter((a) => a.audioTimeMs >= 0);
  const name = source instanceof File ? source.name : '현재 재생 음원';
  const seek = (event: MouseEvent<HTMLDivElement>) => {
    if (locked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1,
    );
    engine.seek(ratio * duration);
  };
  return (
    <section className="daw" aria-label="DAW 타임라인">
      <div className="daw-head">
        <span className="section-label">트랙 ({1 + tracks.length})</span>
        <span className="daw-note">보기 전용 · 원본은 변경되지 않습니다</span>
      </div>
      <div className="daw-grid">
        <div className="daw-corner section-label">시간</div>
        <div
          className="daw-lane daw-ruler"
          onClick={seek}
          title="눌러서 이동"
          data-testid="daw-ruler"
        >
          {ticks.map((t) => (
            <span key={t} className="daw-tick" style={{ left: pct(t * 1000) }}>
              {clock(t)}
            </span>
          ))}
          {flags.map((a, i) => (
            <span
              key={`${a.scoreTick}:${a.audioTimeMs}`}
              className={
                a.audioTimeMs > duration / 2
                  ? 'daw-flag daw-flag-end'
                  : 'daw-flag'
              }
              style={{ left: pct(a.audioTimeMs) }}
            >
              ⚑ 싱크 {i + 1}
              {a.audioTimeMs > duration && ' ▸ 음원 뒤'}
            </span>
          ))}
          <span
            className="daw-playhead"
            style={{ left: pct(state.audioTimeMs) }}
          />
        </div>
        <div className="daw-track">
          <span className="daw-track-no">01</span>
          <strong title={name}>{name}</strong>
        </div>
        <div
          className="daw-lane daw-clip"
          onClick={seek}
          title="눌러서 이동"
          data-testid="daw-clip"
        >
          {peaks === undefined ? (
            <span className="daw-note">파형을 준비하는 중입니다</span>
          ) : peaks === null ? (
            <span className="daw-note">
              파형을 그릴 수 없습니다. 재생은 그대로 됩니다
            </span>
          ) : (
            <WavePath peaks={peaks} />
          )}
          <span
            className="daw-playhead"
            style={{ left: pct(state.audioTimeMs) }}
          />
        </div>
        {tracks.map((track, index) => (
          <Fragment key={track.key}>
            <div
              className={
                track.silent ? 'daw-track daw-track-muted' : 'daw-track'
              }
            >
              <span className="daw-track-no">
                {String(index + 2).padStart(2, '0')}
              </span>
              <strong title={track.name}>{track.name}</strong>
              {track.silent && <span className="daw-note">{track.silent}</span>}
            </div>
            <div
              className="daw-lane daw-sub"
              onClick={seek}
              title="눌러서 이동"
              data-testid={`daw-track-${index + 2}`}
            >
              <TrackClip track={track} duration={duration} />
              <span
                className="daw-playhead"
                style={{ left: pct(state.audioTimeMs) }}
              />
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
