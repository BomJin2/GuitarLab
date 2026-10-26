import { modelPlans } from './modelInstallation';
import { useModelInstallation } from './useModelInstallation';

export function ModelInstallationPanel() {
  const state = useModelInstallation();
  const plan = modelPlans[state.model];
  return (
    <section className="panel" aria-label="선택 모델 설치 파일">
      <h2>선택 모델 · 설치 파일 확인</h2>
      <label>
        확인할 모델{' '}
        <select
          aria-label="확인할 AI 모델"
          value={state.model}
          disabled={state.busy}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'basic-pitch' || value === 'htdemucs_6s')
              state.select(value);
          }}
        >
          <option value="basic-pitch">Basic Pitch 0.4.0</option>
          <option value="htdemucs_6s">Demucs 4.1.0 · 전체 기타</option>
        </select>
      </label>
      <p>
        {plan.name} {plan.version} · {plan.description}
      </p>
      <p>{plan.installation}</p>
      <p>{plan.license}</p>
      <button
        disabled={!state.native || state.busy}
        onClick={() => void state.verify()}
      >
        선택 모델 설치 확인
      </button>
      {state.busy && (
        <p role="status">
          패키지 버전·모델 파일 해시 확인 중{' '}
          <button onClick={state.cancel}>모델 확인 취소</button>
        </p>
      )}
      {state.result && (
        <p role="status">
          설치 파일 확인됨 · Python {state.result.pythonVersion} ·{' '}
          {state.result.modelVersion}
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      {!state.native && (
        <p>설치 파일 확인은 데스크톱 앱에서 사용할 수 있습니다.</p>
      )}
      <p>
        앱 데이터의 활성 환경을 우선 확인합니다. 음원 읽기·모델
        로드·분석·다운로드는 하지 않습니다. 파일 확인 성공은 추론 실행이나
        정확도 검증을 뜻하지 않습니다. 설치는 ‘AI 모델 설치 관리’에서 진행할 수
        있습니다. 별도 Windows 10/11 PC의 배포 수용 검사는 남아 있습니다.
      </p>
    </section>
  );
}
