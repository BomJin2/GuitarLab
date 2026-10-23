import { modelPlans } from './modelInstallation';
import { useCacheCleanup } from './useCacheCleanup';

export function CacheCleanupPanel() {
  const cache = useCacheCleanup();
  return (
    <section className="panel" aria-label="모델 다운로드 캐시 관리">
      <h2>모델 다운로드 캐시 관리</h2>
      <p>
        현재 번들 Python 3.12용으로 받은 파일만 정리합니다. 설치된 모델·활성
        설정·프로젝트·녹음과 이전 Python 3.10 캐시는 유지합니다. 다음 새
        설치에는 재다운로드가 필요할 수 있습니다. 취소해도 이미 지운 캐시는
        복구하지 않습니다.
      </p>
      <label>
        캐시 정리 모델{' '}
        <select
          value={cache.modelId}
          disabled={cache.busy}
          onChange={(event) => {
            const id = event.target.value;
            if (id === 'basic-pitch' || id === 'htdemucs_6s')
              cache.selectModel(id);
          }}
        >
          <option value="basic-pitch">Basic Pitch</option>
          <option value="htdemucs_6s">Demucs 전체 기타</option>
        </select>
      </label>
      <button
        type="button"
        disabled={!cache.native || cache.busy}
        onClick={() => void cache.inspect()}
      >
        캐시 현황 조회
      </button>
      {cache.usage && (
        <p>
          {modelPlans[cache.modelId].name} · {cache.usage.files}개 ·{' '}
          {(cache.usage.bytes / 1048576).toFixed(1)}MiB
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={cache.consent}
          disabled={cache.busy || !cache.usage || cache.usage.files === 0}
          onChange={(event) => cache.setConsent(event.target.checked)}
        />
        선택한 다운로드 캐시의 삭제와 필요 시 재다운로드에 동의합니다.
      </label>
      <button
        type="button"
        disabled={
          !cache.native ||
          cache.busy ||
          !cache.consent ||
          !cache.usage ||
          cache.usage.files === 0
        }
        onClick={() => void cache.clear()}
      >
        선택 캐시 정리
      </button>
      <button
        type="button"
        disabled={!cache.busy || cache.canceling}
        onClick={cache.cancel}
      >
        {cache.canceling ? '취소 정리 중' : '캐시 작업 취소'}
      </button>
      {cache.busy && <p role="status">캐시 작업 중 · {cache.percent}%</p>}
      {cache.notice && <p role="status">{cache.notice}</p>}
    </section>
  );
}
