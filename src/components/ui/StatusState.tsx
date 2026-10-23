export type ViewStatus =
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission'
  | 'deviceLost';
const messages: Record<ViewStatus, string> = {
  loading: '불러오는 중입니다',
  empty: '표시할 데이터가 없습니다',
  error: '작업을 완료하지 못했습니다',
  permission: '입력 사용 권한이 필요합니다',
  deviceLost: '장치가 연결 해제되었습니다',
};
export function StatusState({
  status,
  detail,
  onRetry,
}: {
  status: ViewStatus;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role={status === 'error' || status === 'deviceLost' ? 'alert' : 'status'}
      className="status-state"
    >
      <strong>{messages[status]}</strong>
      {detail && <p>{detail}</p>}
      {onRetry && <button onClick={onRetry}>다시 시도</button>}
    </div>
  );
}
