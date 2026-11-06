import { useEffect, useState } from 'react';
import { decodePeaks } from '../daw/dawWaveform';
import { isSmallWindow } from '../../shared/windowSize';
import type { MixLayer } from './mixing';
import { layerLevels, mixLayerName } from './mixLabels';
import { LiveLevel } from './liveLevel';
import type { ProjectMixController } from './useProjectMix';

// docs/12 "하단 믹서 v1": 믹스 패널과 같은 컨트롤러로 M·S·음량·마스터만 다룹니다.
export function BottomMixer({
  controller: c,
  enabled,
  locked,
  backing = null,
  playing = false,
}: {
  controller: ProjectMixController;
  enabled: boolean;
  locked: boolean;
  /** 재생기의 현재 반주 음원. 펼쳐져 있을 때만 최대값을 읽습니다. */
  backing?: Blob | null;
  /** 주 재생기가 재생 중일 때만 실시간 레벨을 잽니다. */
  playing?: boolean;
}) {
  const [open, setOpen] = useState(() => !isSmallWindow());
  const [backingPeak, setBackingPeak] = useState<{
    source: Blob;
    peak: number | null;
  } | null>(null);
  useEffect(() => {
    if (!open || !backing) return;
    let live = true;
    decodePeaks(backing, 1).then(
      (wave) =>
        live &&
        setBackingPeak({ source: backing, peak: Math.max(0, ...wave.peaks) }),
      () => live && setBackingPeak({ source: backing, peak: null }),
    );
    return () => {
      live = false;
    };
  }, [open, backing]);
  const [live, setLive] = useState<{
    peak: number | null;
    clipping: boolean;
  }>({ peak: null, clipping: false });
  const { levelSources } = c;
  const measuring = open && playing;
  useEffect(() => {
    if (!measuring) return;
    const meter = new LiveLevel();
    let frame = 0;
    let last = 0;
    let clipAt = -Infinity;
    const tick = (now: number) => {
      // 화면 갱신마다 재되, 다시 그리기는 0.1초에 한 번만 합니다.
      if (now - last >= 100) {
        last = now;
        const peak = meter.read(levelSources());
        if (peak !== null && peak >= 1) clipAt = now;
        setLive({ peak, clipping: now - clipAt < 3000 });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      meter.close();
    };
  }, [measuring, levelSources]);
  const livePeak = measuring ? live.peak : null;
  const mix = c.mix;
  const meter = mix
    ? layerLevels(
        mix,
        c,
        backingPeak?.source === backing ? backingPeak.peak : null,
      )
    : null;
  const reason = !enabled
    ? '연습·연주 화면에서 조절할 수 있습니다.'
    : locked
      ? '녹음 중에는 조절할 수 없습니다.'
      : c.busy
        ? '믹스 작업 중입니다.'
        : null;
  const patch = (index: number, change: Partial<MixLayer>) => {
    if (mix)
      c.update({
        ...mix,
        layers: mix.layers.map((l, i) =>
          i === index ? { ...l, ...change } : l,
        ),
      });
  };
  return (
    <section className="bottom-mixer" aria-label="믹서">
      <div className="bottom-mixer-head">
        <strong>믹서</strong>
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '믹서 접기' : '믹서 펼치기'}
        </button>
        {open && mix && reason && <small>{reason}</small>}
      </div>
      {open &&
        (!mix ? (
          <p className="empty-note">프로젝트를 열면 믹스 트랙이 표시됩니다.</p>
        ) : (
          <fieldset className="bottom-mixer-strips" disabled={!!reason}>
            {mix.layers.map((layer, index) => {
              const name = mixLayerName(layer, c);
              const level = meter?.levels[index] ?? null;
              return (
                <div className="mixer-strip" key={layer.id}>
                  <span className="mixer-name" title={name}>
                    {name}
                  </span>
                  <button
                    aria-label={`${name} 음소거`}
                    aria-pressed={layer.mute}
                    onClick={() => patch(index, { mute: !layer.mute })}
                  >
                    M
                  </button>
                  <button
                    aria-label={`${name} Solo`}
                    aria-pressed={layer.solo}
                    onClick={() => patch(index, { solo: !layer.solo })}
                  >
                    S
                  </button>
                  <meter
                    aria-label={`${name} 최대 레벨 추정`}
                    min={0}
                    max={1}
                    high={0.9}
                    value={Math.min(1, level ?? 0)}
                    title={
                      level === null
                        ? '레벨 미확인'
                        : `최대 레벨 추정 ${level.toFixed(2)}`
                    }
                  />
                  <input
                    aria-label={`${name} 믹서 음량`}
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(layer.gain * 100)}
                    onChange={(e) =>
                      patch(index, { gain: Number(e.target.value) / 100 })
                    }
                  />
                </div>
              );
            })}
            <div className="mixer-strip mixer-master">
              <span className="mixer-name">마스터</span>
              <input
                aria-label="믹서 마스터 음량"
                type="range"
                min={0}
                max={100}
                value={Math.round(mix.masterGain * 100)}
                onChange={(e) =>
                  c.update({ ...mix, masterGain: Number(e.target.value) / 100 })
                }
              />
              <meter
                aria-label="마스터 최대 레벨 추정"
                min={0}
                max={1}
                high={0.9}
                value={Math.min(1, meter?.total ?? 0)}
              />
              <small>{meter?.total.toFixed(2)}</small>
              <meter
                aria-label="마스터 실시간 레벨"
                min={0}
                max={1}
                high={0.9}
                value={Math.min(1, livePeak ?? 0)}
              />
              <small>
                실시간 {livePeak === null ? '—' : livePeak.toFixed(2)}
              </small>
            </div>
            {measuring && live.clipping && (
              <p role="status" className="mixer-clip">
                실시간 클리핑 발생 · 음량을 낮추세요
              </p>
            )}
            {meter && meter.total > 1 && (
              <p
                role="status"
                className="mixer-clip"
                title="모든 음원의 최대값이 같은 순간에 겹친다고 가정한 추정입니다. 실제로 겹치지 않으면 클리핑이 없을 수 있습니다."
              >
                클리핑 가능 · 최대 합계 추정 {meter.total.toFixed(2)} · 음량을
                낮추세요
              </p>
            )}
            {meter?.unknown && (
              <small className="mixer-note">일부 음원 레벨 미확인</small>
            )}
          </fieldset>
        ))}
    </section>
  );
}
