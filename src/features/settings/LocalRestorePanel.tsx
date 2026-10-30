import { useLocalRestore } from './useLocalRestore';

const labels = {
  SCHEDULED: '복원 예약됨 · 다음 실행에서 적용',
  APPLYING: '복원 적용 상태 확인 필요',
  COMPLETED: '이전 복원 완료',
  ROLLED_BACK: '중단된 복원을 되돌렸습니다',
  CANCELED: '복원 예약 해제됨',
  FAILED: '복원을 적용하지 못했습니다',
};
export function LocalRestorePanel() {
  const restore = useLocalRestore();
  const active =
    restore.status?.state === 'SCHEDULED' ||
    restore.status?.state === 'APPLYING';
  return (
    <section className="panel" aria-label="현재 데이터 실제 복원">
      <h2>현재 데이터 실제 복원</h2>
      <p>
        검사한 ZIP으로 프로젝트·악보·녹음·기록·보정값을 교체합니다. 지금은
        예약만 하며, 저장하고 앱을 닫은 뒤 다음 실행에서 최신 현재 자료를 별도
        백업하고 적용합니다. 최대 2GiB입니다. AI 모델·외부 원본·다른 설정은
        유지합니다. 외부 참조는 다시 연결해야 하며 이전 ZIP에 없는 보정값은 다시
        측정해야 할 수 있습니다. 준비본과 백업·복구 폴더는 자동 삭제하지
        않습니다.
      </p>
      <label>
        <input
          type="checkbox"
          checked={restore.consent}
          disabled={restore.busy || active}
          onChange={(e) => restore.setConsent(e.target.checked)}
        />
        현재 자료를 선택한 백업으로 교체하는 것에 동의합니다.
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={
            !restore.native ||
            !restore.consent ||
            restore.busy ||
            active ||
            !restore.status
          }
          onClick={() => void restore.schedule()}
        >
          백업 ZIP으로 복원 예약
        </button>
        <button
          type="button"
          disabled={!restore.native || restore.busy}
          onClick={() => void restore.refresh()}
        >
          복원 상태 다시 읽기
        </button>
        <button
          type="button"
          disabled={
            !restore.native ||
            restore.busy ||
            restore.status?.state !== 'SCHEDULED'
          }
          onClick={() => void restore.cancelReservation()}
        >
          복원 예약 해제
        </button>
        <button
          type="button"
          disabled={!restore.busy}
          onClick={restore.cancelJob}
        >
          진행 작업 취소
        </button>
      </div>
      {restore.busy && (
        <p role="status">
          ZIP 선택·검사 또는 예약 처리 중 ·{' '}
          {((restore.job?.completedBytes ?? 0) / 1048576).toFixed(1)}MiB
        </p>
      )}
      {restore.status && restore.status.state !== 'IDLE' && (
        <p role="status">
          {labels[restore.status.state]} · {restore.status.files}개 파일 · 외부
          참조 {restore.status.externalReferencesNotCopied}개
          {restore.status.errorCode ? ` · ${restore.status.errorCode}` : ''}
        </p>
      )}
      {restore.notice && <p role="status">{restore.notice}</p>}
    </section>
  );
}
