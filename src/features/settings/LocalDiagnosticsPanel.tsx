import { diagnosticLabels } from './localDiagnostics';
import { useLocalDiagnostics } from './useLocalDiagnostics';

export function LocalDiagnosticsPanel() {
  const diagnostics = useLocalDiagnostics();
  return (
    <section className="panel" aria-label="로컬 오류 진단">
      <h2>로컬 오류 진단</h2>
      <p>
        초기화·종료와 네이티브 panic의 고정 코드만 최근 64건 보존합니다.
        경로·오디오·예외 원문은 기록하지 않으며 자동 전송하지 않습니다. 강제
        종료·OS 충돌 등 모든 종료 원인을 포착하는 기능은 아닙니다.
      </p>
      <button
        type="button"
        disabled={!diagnostics.native || diagnostics.state.status === 'loading'}
        onClick={() => void diagnostics.read()}
      >
        로컬 진단 읽기
      </button>
      {diagnostics.state.status === 'loading' && (
        <p role="status">로컬 진단 읽는 중</p>
      )}
      {diagnostics.state.status === 'error' && (
        <p role="status">
          로컬 진단을 읽지 못했습니다. 앱의 다른 기능은 계속 사용할 수 있습니다.
        </p>
      )}
      {diagnostics.state.status === 'ready' && (
        <>
          <p role="status">
            {diagnostics.state.value.persistenceAvailable
              ? '로컬 진단 저장 확인됨'
              : '로컬 진단 저장 확인 안 됨'}{' '}
            · 이번 실행의 기록 누락 {diagnostics.state.value.droppedEvents}건
          </p>
          {diagnostics.state.value.events.length === 0 ? (
            <p>아직 저장된 진단이 없습니다.</p>
          ) : (
            <ol>
              {diagnostics.state.value.events.map((event, index) => (
                <li key={`${event.unixMs}-${index}`}>
                  {new Date(event.unixMs).toLocaleString('ko-KR')} ·{' '}
                  {diagnosticLabels[event.code]} · {event.code}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
