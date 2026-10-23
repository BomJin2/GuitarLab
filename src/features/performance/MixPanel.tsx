import { useState, useSyncExternalStore } from 'react';
import type { ProjectMixController } from './useProjectMix';
import { guitarRoleLabels } from '../../entities/guitarRoles';
export function MixPanel({
  controller: c,
  locked,
}: {
  controller: ProjectMixController;
  locked: boolean;
}) {
  const [rights, setRights] = useState(false);
  const preview = useSyncExternalStore(
    c.preview.subscribe,
    c.preview.getSnapshot,
  );
  if (!c.mix) return c.error ? <p role="alert">{c.error}</p> : null;
  const mix = c.mix;
  const hasStems = mix.layers.some((layer) => layer.kind === 'STEM');
  const hasImported = mix.layers.some(
    (layer) => layer.kind === 'IMPORTED_STEM',
  );
  const stemNames = new Map(
    c.stems.map((stem) => [
      stem.id,
      stem.role === 'GUITAR_FULL'
        ? '전체 기타 · AI 추정'
        : '잔여 반주 · AI 추정',
    ]),
  );
  return (
    <section className="panel" aria-label="로컬 믹스와 오버더빙">
      <h2>로컬 믹스 · 오버더빙</h2>
      <p>
        실제 저장된 테이크·분리 음원을 사용합니다. 믹스 준비 후 하단 재생을
        따르며 REC는 새 입력만 별도 테이크로 저장합니다. 무반주 테이크는0ms부터
        수동 정렬합니다.
      </p>
      <fieldset disabled={locked || c.busy}>
        <legend>재생 소스</legend>
        <button onClick={() => void c.refresh()}>
          테이크·저장 믹스 다시 읽기
        </button>
        <button onClick={() => void c.refreshImported()}>
          믹스용 사용자 기타 목록 읽기
        </button>
        <label>
          추가할 사용자 기타 파일
          <select
            aria-label="믹스에 추가할 사용자 기타 파일"
            value=""
            disabled={mix.layers.length >= 8}
            onChange={(event) => c.addImported(event.target.value)}
          >
            <option value="">선택하세요</option>
            {c.importedStems
              .filter(
                (stem) => !mix.layers.some((layer) => layer.id === stem.id),
              )
              .map((stem) => (
                <option key={stem.id} value={stem.id}>
                  {stem.name} · {guitarRoleLabels[stem.role]} · 사용자 제공 음원
                </option>
              ))}
          </select>
        </label>
        <button
          disabled={!c.canConfigureStems}
          onClick={() => void c.configureStems()}
        >
          분리 2개만으로 출력 믹스 구성
        </button>
        <p>
          현재 레이어 목록을 저장된 전체 기타·잔여 반주로 교체합니다. 원본
          파일과 기존 저장 믹스는 유지하며, 설정 저장은 별도입니다.
        </p>
        <label>
          추가할 테이크
          <select
            aria-label="믹스에 추가할 테이크"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              c.update(
                {
                  ...mix,
                  layers: [
                    ...mix.layers,
                    {
                      kind: 'TAKE',
                      id: e.target.value,
                      gain: 0.7,
                      mute: false,
                      solo: false,
                      offsetMs: 0,
                    },
                  ],
                },
                true,
              );
            }}
          >
            <option value="">선택하세요</option>
            {c.takes
              .filter(
                (t) =>
                  t.state === 'READY' && !mix.layers.some((l) => l.id === t.id),
              )
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {(t.frames / t.sampleRate).toFixed(2)}초 ·{' '}
                  {t.transport?.rate ?? '무반주'}
                  {t.transport ? '×' : ''}
                </option>
              ))}
          </select>
        </label>
      </fieldset>
      {mix.layers.map((layer, index) => (
        <div className="toolbar" key={layer.id}>
          <span>
            {layer.kind === 'LOCAL_ASSET'
              ? '로컬 반주'
              : layer.kind === 'IMPORTED_STEM'
                ? `${c.importedStems.find((stem) => stem.id === layer.id)?.name ?? layer.id.slice(0, 8)} · 사용자 제공 음원`
                : layer.kind === 'STEM'
                  ? `${stemNames.get(layer.id) ?? '저장 분리 음원'} · ${layer.id.slice(0, 8)}`
                  : (c.takes.find((t) => t.id === layer.id)?.name ??
                    '누락된 테이크')}
          </span>
          <label>
            음량
            <input
              aria-label={`레이어 ${index + 1} 음량`}
              type="range"
              min={0}
              max={100}
              value={Math.round(layer.gain * 100)}
              disabled={c.busy}
              onChange={(e) =>
                c.update({
                  ...mix,
                  layers: mix.layers.map((l, i) =>
                    i === index
                      ? { ...l, gain: Number(e.target.value) / 100 }
                      : l,
                  ),
                })
              }
            />
          </label>
          <button
            aria-pressed={layer.mute}
            disabled={c.busy}
            onClick={() =>
              c.update({
                ...mix,
                layers: mix.layers.map((l, i) =>
                  i === index ? { ...l, mute: !l.mute } : l,
                ),
              })
            }
          >
            음소거
          </button>
          <button
            aria-pressed={layer.solo}
            disabled={c.busy}
            onClick={() =>
              c.update({
                ...mix,
                layers: mix.layers.map((l, i) =>
                  i === index ? { ...l, solo: !l.solo } : l,
                ),
              })
            }
          >
            Solo
          </button>
          <label>
            추가 오프셋 ms
            <input
              aria-label={`레이어 ${index + 1} 오프셋 ms`}
              type="number"
              min={-60000}
              max={60000}
              value={layer.offsetMs}
              disabled={locked || c.busy || layer.kind === 'LOCAL_ASSET'}
              onChange={(e) =>
                c.update({
                  ...mix,
                  layers: mix.layers.map((l, i) =>
                    i === index
                      ? { ...l, offsetMs: Number(e.target.value) }
                      : l,
                  ),
                })
              }
            />
          </label>
          <button
            disabled={locked || c.busy}
            onClick={() =>
              c.update(
                { ...mix, layers: mix.layers.filter((_, i) => i !== index) },
                true,
              )
            }
          >
            레이어 제외
          </button>
        </div>
      ))}
      <label>
        믹스 전체 음량
        <input
          aria-label="믹스 전체 음량"
          type="range"
          min={0}
          max={100}
          value={Math.round(mix.masterGain * 100)}
          disabled={c.busy}
          onChange={(e) =>
            c.update({ ...mix, masterGain: Number(e.target.value) / 100 })
          }
        />
      </label>
      <div className="toolbar">
        <button
          disabled={locked || c.busy || mix.layers.length > 8}
          onClick={() => void c.prepare()}
        >
          오버더빙 믹스 준비
        </button>
        <button disabled={locked || c.busy || !c.prepared} onClick={c.clear}>
          믹스 연결 해제
        </button>
        <button disabled={locked || c.busy} onClick={() => void c.save()}>
          믹스 설정 저장
        </button>
        <button disabled={locked || c.busy} onClick={() => void c.render()}>
          출력 믹스 만들기
        </button>
        <button
          disabled={locked || c.busy || preview.durationMs <= 0}
          onClick={() => {
            if (preview.status === 'playing') c.preview.pause();
            else void c.preview.play();
          }}
        >
          {preview.status === 'playing' ? '출력 일시정지' : '출력 미리 듣기'}
        </button>
      </div>
      {hasImported && (
        <p>
          사용자 기타 파일은 믹스 준비 후 하단 재생·음량·음소거·Solo를 따릅니다.
          위치는 오프셋으로 직접 맞추며 샘플 단위 동기는 보장하지 않습니다.
          REC는 선택 입력만 별도 테이크로 저장합니다. WAV 출력은 기존대로
          stereo를 mono로 합칩니다.
        </p>
      )}
      {hasStems && (
        <p>
          분리 음원은 믹스 준비 후 하단 재생·음량·음소거·Solo를 따릅니다. 원본
          반주 레이어가 없으면 원본 소리는 끄고 시간축만 유지합니다. 다중 재생의
          샘플 단위 동기는 보장하지 않습니다.
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={rights}
          disabled={locked || c.busy}
          onChange={(e) => setRights(e.target.checked)}
        />
        로컬 반주·테이크를 파일로 출력할 사용 권한이 있습니다.
      </label>
      <button
        disabled={locked || c.busy || !rights}
        onClick={() => void c.exportWav()}
      >
        새 WAV로 내보내기
      </button>
      {c.busy && (
        <p role="status">
          믹스 작업 중 · {c.job?.completedBytes ?? 0}/{c.job?.totalBytes ?? 0}
          바이트 <button onClick={c.cancel}>믹스 작업 취소</button>
        </p>
      )}
      {c.notice && <p role="status">{c.notice}</p>}
      {(c.error || preview.error) && (
        <p role="alert">{c.error ?? preview.error}</p>
      )}
      {c.stats && (
        <p>
          출력 {(c.stats.frames / c.stats.sampleRate).toFixed(2)}초 · 48kHz mono
          float32 · 제한 전 peak {c.stats.peak.toFixed(3)} · 출력 제한{' '}
          {c.stats.limitedFrames}프레임
        </p>
      )}
      <small>
        서로 다른 악보 리비전·반주의 테이크는 자동 정렬을 보장하지 않습니다.
        오버더빙 준비는 현재 저장 리비전·반주와 일치하는 테이크만 허용합니다.
        청취용 다중 재생은 샘플 단위 동기를 보장하지 않습니다. WAV
        출력은1×/무반주 테이크와 PCM16·float32 WAV 반주, 입력 합계64MiB까지
        지원합니다. MP3·배속 녹음 출력/고품질 리샘플링은 미지원입니다. 반주
        오프셋은 현재0ms입니다. YouTube 출력은 포함하지 않습니다.
      </small>
    </section>
  );
}
