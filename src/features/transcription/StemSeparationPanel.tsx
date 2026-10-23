import type { ProjectController } from '../library/useProjects';
import { useSeparation } from './useSeparation';
import { separationCapabilities } from './separation';

export function StemSeparationPanel({
  project,
}: {
  project?: Pick<ProjectController, 'details' | 'audioAssetId' | 'busy'>;
}) {
  const state = useSeparation(project);
  const preview = state.preview;
  return (
    <section className="panel" aria-label="전체 기타 음원 분리">
      <h2>전체 기타 분리 · Demucs 개발 미리보기</h2>
      <p>
        연구용 가중치를 사용하는 로컬 AI 추정입니다. 전체 기타와 잔여 반주를
        만들며 리드/리듬 분리는 지원하지 않습니다. 원본·악보·녹음은 유지합니다.
      </p>
      {separationCapabilities.leadRhythm === 'UNSUPPORTED' && (
        <aside aria-label="리드·리듬 분리 지원 범위">
          <p>
            리드·리듬 자동 분리: 미지원. 현재 모델은 두 기타를 하나의 전체
            기타로 추정합니다. 악보의 기타 트랙이나 역할 이름을 바꿔도 음원이
            분리되지 않습니다.
          </p>
          <p>
            별도 리드·리듬 WAV가 있다면{' '}
            <a href="#/performance">연주에서 별도 기타 파일 불러오기</a>를
            이용하세요. 개별 파일이 없으면 아래 전체 기타 분리 후 ‘잔여 반주’를
            듣거나, 연주의 로컬 믹스에서 잔여 반주만 사용하세요. 이 반주는
            리드와 리듬을 함께 제거한 AI 추정입니다.
          </p>
        </aside>
      )}
      <button
        disabled={!state.native || !state.available || state.busy}
        onClick={() => void state.analyze()}
      >
        프로젝트 WAV에서 전체 기타 분리
      </button>
      <button
        disabled={!state.native || !state.available || state.busy}
        onClick={() => void state.restore()}
      >
        저장된 분리 결과 불러오기
      </button>
      <p>
        60초/64MiB 이하 기본 PCM16/float32 WAV · 분리 중 CPU 사용 · 성공한
        결과는 프로젝트에 별도로 저장됩니다. 다시 불러오기는 재분석하지
        않습니다. 프로젝트당20개까지 보존하며 연주의 로컬 믹스에서 저장 분리
        음원을 사용할 수 있습니다.
      </p>
      {state.busy && (
        <p role="status">
          분리 결과 처리 중 · <button onClick={state.cancel}>분리 취소</button>
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.notice && <p role="status">{state.notice}</p>}
      {preview && (
        <>
          <p role="status">
            AI 분리 미리보기 · {(preview.info.durationMs / 1000).toFixed(2)}초 ·
            44,100 Hz / 2채널 · 로컬 저장됨
          </p>
          {preview.sources.map((source, index) => (
            <div key={source.role}>
              <label>
                {source.role === 'GUITAR_FULL'
                  ? '전체 기타 · AI 추정'
                  : '잔여 반주 · 원본에서 추정 기타를 뺀 결과'}
                <audio controls preload="metadata" src={source.url} />
              </label>
              <p>
                peak {preview.info.stems[index]?.peak.toFixed(3)} · 다른 악기
                혼입·음 누락이 있을 수 있습니다.
              </p>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
