import type { RecordedTake } from './recordings';
import { useTakeExport } from './useTakeExport';

export function TakeExportPanel({ take }: { take: RecordedTake }) {
  const state = useTakeExport(take);
  return (
    <section className="panel" aria-label="녹음 원본 내보내기">
      <h2>선택 테이크 원본 WAV</h2>
      <p>
        전체 녹음을 원래 mono float32 WAV 그대로 새 파일에 복사합니다.
        배속·정렬·음량·부분 반복과 반주는 적용하지 않습니다. 이름·메모·누락/복구
        정보는 WAV에 포함되지 않습니다.
      </p>
      {(take.droppedFrames > 0 ||
        take.warningIntervals.length > 0 ||
        take.recoveredFrom !== null ||
        take.errorCode !== null) && (
        <p role="alert">
          누락 또는 복구 안내가 있는 테이크입니다. 내보내도 잃은 구간이 복원되지
          않습니다.
        </p>
      )}
      <button
        disabled={!state.available || state.busy || take.state !== 'READY'}
        onClick={() => void state.exportTake()}
      >
        원본 WAV를 새 파일로 내보내기
      </button>
      <button disabled={!state.busy || state.canceling} onClick={state.cancel}>
        내보내기 취소
      </button>
      {!state.available && <p>Windows 앱에서 사용할 수 있습니다.</p>}
      {state.busy && (
        <p role="status">
          {state.canceling
            ? '취소 정리 중'
            : state.job?.state === 'PICKING'
              ? '새 파일 위치 선택 중'
              : '원본 검사·저장 중'}{' '}
          · {state.job?.completedBytes ?? 0}/{state.job?.totalBytes ?? 0}바이트.
          선택 창이 열려 있으면 그 창도 닫아주세요.
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
      {state.error && <p role="alert">{state.error}</p>}
    </section>
  );
}
