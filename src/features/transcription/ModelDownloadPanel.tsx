import { useModelDownload } from './useModelDownload';
import { modelPlans } from './modelInstallation';

export function ModelDownloadPanel() {
  const state = useModelDownload();
  const plan = modelPlans[state.modelId];
  const demucs = state.modelId === 'htdemucs_6s';
  return (
    <section className="panel" aria-label="AI 모델 선택 다운로드">
      <h2>
        {plan.name} {plan.version} · 설치 파일 받기
      </h2>
      <label>
        다운로드할 AI 모델{' '}
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
        {demucs
          ? '고정33개 또는34개 파일·약675~676MiB'
          : '고정41개 또는42개 파일·약138~140MiB'}
        를 앱 데이터에 캐시합니다. 기존 설치 환경과 사용자 음원은 변경하지
        않습니다.
      </p>
      <p>설치 여유 공간은 {demucs ? '4GiB' : '1GiB'}입니다.</p>
      <label>
        <input
          type="checkbox"
          checked={state.consent}
          disabled={state.busy}
          onChange={(event) => state.setConsent(event.target.checked)}
        />
        {demucs
          ? '연구용 가중치 이용 안내를 확인했고 이 파일들의 다운로드와 앱 데이터 저장에 동의합니다'
          : '이 파일들의 다운로드와 앱 데이터 저장에 동의합니다'}
      </label>
      <button
        disabled={!state.native || !state.consent || state.busy}
        onClick={() => void state.download()}
      >
        {plan.name} 파일 다운로드
      </button>
      {state.busy && (
        <p role="status">
          파일 수신·검증 {state.percent}%{' '}
          <button onClick={state.cancel}>다운로드 취소</button>
        </p>
      )}
      {state.result && (
        <p role="status">
          다운로드 파일 확인됨 · {state.result.artifactCount}개 · 재사용{' '}
          {state.result.reusedFiles}개 · 설치 상태는 별도로 확인합니다.
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.notice && <p role="status">{state.notice}</p>}
      {!state.native && <p>다운로드는 데스크톱 앱에서 사용할 수 있습니다.</p>}
      {demucs && (
        <p>
          {plan.license} · 전체 기타/잔여 반주 분리용이며 Lead/Rhythm 분리는
          지원하지 않습니다. 가중치는 앱 번들에 포함하지 않습니다.
        </p>
      )}
      <p>
        같은 캐시는 크기·해시 확인 후 재사용하며, 손상된 기존 파일은 덮어쓰지
        않습니다. 취소 시 현재 미완성 파일을 정리합니다. 네트워크가 필요하고
        다운로드 서버에는 일반 접속 정보가 전달됩니다. 음원 업로드·패키지
        실행·자동 설치는 하지 않습니다. 받은 파일은 아래 설치 버튼으로
        설치합니다. Basic Pitch의 새 런타임에서는 동의 후 공식 원본을 받아 ONNX
        전용 로컬 패키지를 만들며 코드를 실행하지 않습니다. 새 PC 배포 검증은
        후속 작업입니다.
      </p>
    </section>
  );
}
