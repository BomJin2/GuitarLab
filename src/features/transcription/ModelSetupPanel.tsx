import { useModelSetup } from './useModelSetup';
import { modelPlans } from './modelInstallation';

export function ModelSetupPanel() {
  const state = useModelSetup();
  const plan = modelPlans[state.modelId];
  return (
    <section className="panel" aria-label="AI 모델 설치 관리">
      <h2>
        {plan.name} {plan.version} · 설치 / 재검증
      </h2>
      <label>
        설치할 AI 모델{' '}
        <select
          disabled={state.busy}
          value={state.modelId}
          onChange={(event) => {
            const id = event.target.value;
            if (id === 'basic-pitch' || id === 'htdemucs_6s')
              state.selectModel(id);
          }}
        >
          <option value="basic-pitch">Basic Pitch</option>
          <option value="htdemucs_6s">Demucs 전체 기타</option>
        </select>
      </label>
      <p>
        검증된 로컬 설치 파일로 별도 앱 데이터 환경에 오프라인 설치합니다. 새
        설치 여유 공간은 {state.modelId === 'basic-pitch' ? '1GiB' : '4GiB'}
        입니다. 이미 설치되어 있으면 같은 환경을 재검증합니다.
      </p>
      <button
        disabled={!state.native || state.busy}
        onClick={() => void state.install()}
      >
        {plan.name} 설치 / 재검증
      </button>
      {state.busy && (
        <p role="status">
          {state.stage} <button onClick={state.cancel}>설치 취소</button>
        </p>
      )}
      {state.result && (
        <p role="status">
          {state.result.state === 'INSTALLED'
            ? '설치·활성화 완료'
            : '기존 설치 재검증 완료'}{' '}
          ·{' '}
          {state.result.modelId === 'basic-pitch'
            ? '자체 8음 분석 통과'
            : '자체 4초 기타·반주 분리 통과'}{' '}
          · {plan.name} {plan.version}
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.notice && <p role="status">{state.notice}</p>}
      {!state.native && <p>설치는 데스크톱 앱에서 사용할 수 있습니다.</p>}
      <p>
        개인 음원은 사용하지 않습니다. 취소·실패 시 새 임시 환경만 정리하고 기존
        설치와 프로젝트는 보존합니다. 로컬 Python 런타임을 사용하며 새 PC의 독립
        배포 검증은 아직 마치지 않았습니다.
      </p>
      <p>{plan.license}</p>
    </section>
  );
}
