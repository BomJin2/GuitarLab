import { useLocalBackup } from './useLocalBackup';

const labels = {
  CREATE: {
    picking: '새 ZIP 위치 선택 중',
    running: '백업·지문 확인 중',
    cancel: '백업 취소',
  },
  VERIFY: {
    picking: '검사할 ZIP 선택 중',
    running: '선택 ZIP 지문 확인 중',
    cancel: '검사 취소',
  },
  PREVIEW: {
    picking: 'ZIP·새 폴더 위치 선택 중',
    running: '새 폴더 추출·DB 확인 중',
    cancel: '복원 미리보기 취소',
  },
};

export function LocalBackupPanel() {
  const backup = useLocalBackup();
  return (
    <section className="panel" aria-label="로컬 데이터 백업">
      <h2>로컬 데이터 백업</h2>
      <p>
        프로젝트·악보·기록·녹음·보정값을 새 ZIP에 보존합니다. 데이터 합계 최대
        2GiB이며 모델·캐시·외부 참조 음원은 제외합니다. 복원 미리보기는 선택한
        상위 폴더에 새 GuitarLab-backup-preview 폴더를 만듭니다. 기존 폴더와
        현재 앱 데이터는 교체하지 않습니다.
      </p>
      <label>
        <input
          type="checkbox"
          checked={backup.consent}
          disabled={backup.busy}
          onChange={(event) => backup.setConsent(event.target.checked)}
        />
        개인 녹음·메모·외부 파일 경로가 포함된 로컬 백업·새 폴더 추출에
        동의합니다.
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!backup.native || !backup.consent || backup.busy}
          onClick={() => void backup.start()}
        >
          새 ZIP으로 백업
        </button>
        <button
          type="button"
          disabled={!backup.native || backup.busy}
          onClick={() => void backup.verify()}
        >
          백업 ZIP 검사
        </button>
        <button
          type="button"
          disabled={!backup.native || !backup.consent || backup.busy}
          onClick={() => void backup.preview()}
        >
          새 폴더 복원 미리보기
        </button>
        <button
          type="button"
          disabled={!backup.busy || backup.canceling}
          onClick={backup.cancel}
        >
          {backup.canceling ? '취소 정리 중' : labels[backup.mode].cancel}
        </button>
      </div>
      {backup.busy && (
        <p role="status">
          {backup.job?.state === 'PICKING'
            ? labels[backup.mode].picking
            : labels[backup.mode].running}{' '}
          · {((backup.job?.completedBytes ?? 0) / 1048576).toFixed(1)}MiB
        </p>
      )}
      {backup.result?.state === 'VERIFIED' && (
        <p role="status">
          선택한 백업 ZIP의 {backup.result.files}개 파일 지문을 확인했습니다.
        </p>
      )}
      {backup.result?.state === 'RESTORED_TO_NEW_FOLDER' && (
        <p role="status">
          새 GuitarLab-backup-preview 폴더에 {backup.result.files}개 파일을
          추출하고 DB를 확인했습니다. 현재 앱 데이터는 바꾸지 않았습니다. 외부
          참조 음원 {backup.result.externalReferencesNotCopied}개는 별도로
          연결해야 합니다.
        </p>
      )}
      {backup.result?.state === 'COMPLETED' && (
        <p role="status">
          새 ZIP에 {backup.result.files}개 파일을 보존했습니다. 외부 참조 음원{' '}
          {backup.result.externalReferencesNotCopied}개는 복사하지 않았습니다.
        </p>
      )}
      {backup.notice && <p role="status">{backup.notice}</p>}
    </section>
  );
}
