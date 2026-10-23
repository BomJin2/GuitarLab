import { useEffect, useRef } from 'react';
import { guitarRoleLabels } from '../../entities/guitarRoles';
import { usePlayerEngine } from '../player/usePlayer';
import { useImportedStems } from './useImportedStems';
export function ImportedStemsPanel({
  projectId,
  locked,
}: {
  projectId?: string;
  locked: boolean;
}) {
  const state = useImportedStems(projectId, locked);
  const engine = usePlayerEngine();
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = audio.current;
    return () => {
      element?.pause();
      element?.removeAttribute('src');
      element?.load();
    };
  }, [state.preview?.url]);
  return (
    <section className="panel" aria-label="사용자 기타 파일">
      <h2>별도 기타 파일 불러오기</h2>
      <p>
        이미 따로 있는 리드·리듬 WAV를 프로젝트에 복사합니다. 역할은 직접
        지정하며 AI 자동 분리가 아닙니다. 원래 파일은 변경하지 않습니다.
      </p>
      {!projectId && <p>라이브러리에서 프로젝트를 먼저 열어주세요.</p>}
      <label>
        파일의 기타 역할
        <select
          value={state.role}
          disabled={!state.available || state.busy}
          onChange={(event) => state.changeRole(event.target.value)}
        >
          {Object.entries(guitarRoleLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!state.available || state.busy}
        onClick={() => void state.import()}
      >
        기타 WAV 선택·보존
      </button>
      <button
        disabled={!state.available || state.busy}
        onClick={() => void state.refresh()}
      >
        사용자 기타 목록 다시 읽기
      </button>
      <button disabled={!state.busy} onClick={state.cancel}>
        기타 파일 작업 취소
      </button>
      {state.busy && (
        <p role="status">
          {state.job?.state === 'PICKING'
            ? 'WAV 파일 선택 대기'
            : state.job?.state === 'CANCELING'
              ? '취소 처리 중'
              : '기타 파일 처리 중'}{' '}
          · {state.job?.completedBytes ?? 0}/{state.job?.totalBytes ?? 0}바이트
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.notice && <p role="status">{state.notice}</p>}
      <ul>
        {state.items.map((stem) => (
          <li key={stem.id}>
            {stem.name} · {guitarRoleLabels[stem.role]} · 사용자 제공 음원 ·{' '}
            {(stem.durationMs / 1000).toFixed(2)}초 / {stem.sampleRate}Hz /{' '}
            {stem.channels}채널{' '}
            <button
              disabled={!state.available || state.busy}
              onClick={() => {
                engine.pause();
                void state.read(stem.id);
              }}
            >
              선택 파일 듣기 · {stem.name}
            </button>
          </li>
        ))}
      </ul>
      {state.preview && (
        <div>
          <p>
            {state.preview.stem.name} · 사용자 제공 · peak{' '}
            {state.preview.stem.peak.toFixed(3)}
          </p>
          <audio
            key={state.preview.url}
            ref={audio}
            aria-label="선택한 사용자 기타 파일"
            controls
            preload="metadata"
            src={state.preview.url}
          />
        </div>
      )}
      <p>
        최대20개/프로젝트 · 64MiB/10분 이하 · mono/stereo PCM16·float32 WAV.
        목록 조회는 재분석하지 않습니다. 아래 로컬 믹스에서 사용자 기타 목록을
        읽고 음량·음소거·Solo·오프셋을 설정할 수 있습니다. 연주 중 연결은
        ‘오버더빙 믹스 준비’를 누른 뒤 하단 재생을 사용합니다.
      </p>
    </section>
  );
}
