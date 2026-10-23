import { useAiRuntime } from './useAiRuntime';
import { ModelInstallationPanel } from './ModelInstallationPanel';
import { ModelDownloadPanel } from './ModelDownloadPanel';
import { ModelSetupPanel } from './ModelSetupPanel';

export function AiRuntimePanel() {
  const state = useAiRuntime();
  return (
    <>
      <section className="panel" aria-label="AI 개발 환경">
        <h2>AI 개발 환경 · 설치 상태 확인</h2>
        <p>
          로컬 worker의 Python과 패키지 설치 정보만 확인합니다. 음원을 읽거나
          모델을 로드·다운로드하지 않습니다.
        </p>
        <button
          disabled={!state.native || state.busy}
          onClick={() => void state.inspect()}
        >
          AI 환경 확인
        </button>
        {state.busy && (
          <p role="status">
            Python 작업 프로세스 확인 중{' '}
            <button onClick={state.cancel}>환경 확인 취소</button>
          </p>
        )}
        {!state.native && (
          <p>환경 확인은 데스크톱 앱에서 사용할 수 있습니다.</p>
        )}
        {state.runtime && (
          <>
            <p>Python {state.runtime.pythonVersion} · 로컬 worker 연결됨</p>
            <ul>
              {state.runtime.models.map((m) => (
                <li key={m.id}>
                  {m.id} ·{' '}
                  {m.state === 'PACKAGE_MISSING'
                    ? '패키지 미설치'
                    : `패키지 ${m.packageVersion} · 가중치/호환성 미검증`}{' '}
                  · 분석 사용 불가
                </li>
              ))}
            </ul>
          </>
        )}
        {state.error && <p role="alert">{state.error}</p>}
        {state.notice && <p role="status">{state.notice}</p>}
        <p>
          카피 화면의 WAV 분석과 전체 기타 분리는 각각 별도 Basic Pitch·Demucs
          환경을 사용하며 위 목록과 설치 환경이 다릅니다. Basic Pitch 설치와
          실제 모델 환경의 파일 검증은 아래에서 합니다.
        </p>
      </section>
      <ModelInstallationPanel />
      <ModelDownloadPanel />
      <ModelSetupPanel />
      <CacheCleanupPanel />
    </>
  );
}
import { CacheCleanupPanel } from './CacheCleanupPanel';
