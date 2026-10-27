import { isTauri } from '@tauri-apps/api/core';
import { runStorageJob, type JobSnapshot } from '../library/projects';
import { isRecord, isSafeUnsigned } from '../../shared/validation';

type BackupSummary = {
  schemaVersion: 1;
  files: number;
  bytes: number;
  externalReferencesNotCopied: number;
  restoreSupported: false;
};
export type LocalBackupResult = BackupSummary &
  (
    | { state: 'COMPLETED' | 'VERIFIED' }
    | { state: 'RESTORED_TO_NEW_FOLDER'; appDataReplaced: false }
  );
export type LocalBackupMode = 'CREATE' | 'VERIFY' | 'PREVIEW';
export function decodeLocalBackup(
  value: unknown,
  expectedState: LocalBackupResult['state'] = 'COMPLETED',
): LocalBackupResult {
  if (
    !isRecord(value) ||
    Object.keys(value).length !==
      (expectedState === 'RESTORED_TO_NEW_FOLDER' ? 7 : 6) ||
    (expectedState === 'RESTORED_TO_NEW_FOLDER' &&
      value.appDataReplaced !== false) ||
    value.schemaVersion !== 1 ||
    value.state !== expectedState ||
    !isSafeUnsigned(value.files, 9999) ||
    value.files === 0 ||
    !isSafeUnsigned(value.bytes, 256 * 1024 * 1024) ||
    value.bytes === 0 ||
    !isSafeUnsigned(value.externalReferencesNotCopied, 100000) ||
    value.restoreSupported !== false
  )
    throw new Error('BACKUP_PROTOCOL_INVALID');
  const summary: BackupSummary = {
    schemaVersion: 1,
    files: value.files,
    bytes: value.bytes,
    externalReferencesNotCopied: value.externalReferencesNotCopied,
    restoreSupported: false,
  };
  return expectedState === 'RESTORED_TO_NEW_FOLDER'
    ? { ...summary, state: expectedState, appDataReplaced: false }
    : { ...summary, state: expectedState };
}
export const localBackupApi = {
  available: isTauri,
  async create(signal: AbortSignal, progress: (job: JobSnapshot) => void) {
    return decodeLocalBackup(
      await runStorageJob(
        'backup_local_data',
        { consentLocalData: true },
        signal,
        progress,
        { waitForCancellation: true },
      ),
    );
  },
  async verify(signal: AbortSignal, progress: (job: JobSnapshot) => void) {
    return decodeLocalBackup(
      await runStorageJob('verify_local_backup', {}, signal, progress, {
        waitForCancellation: true,
      }),
      'VERIFIED',
    );
  },
  async preview(signal: AbortSignal, progress: (job: JobSnapshot) => void) {
    return decodeLocalBackup(
      await runStorageJob(
        'preview_local_backup',
        { consentLocalData: true },
        signal,
        progress,
        {
          waitForCancellation: true,
        },
      ),
      'RESTORED_TO_NEW_FOLDER',
    );
  },
};
export function backupError(cause: unknown) {
  const code = cause instanceof Error ? cause.message : '';
  const messages: Record<string, string> = {
    RECORDING_BUSY: '녹음 STOP과 저장을 마친 뒤 백업해주세요.',
    STORAGE_BUSY: '다른 파일 작업이 끝난 뒤 백업해주세요.',
    BACKUP_LIMIT_EXCEEDED:
      '이번 백업은 최대 256MiB·10,000개 미만 파일을 지원합니다.',
    DISK_SPACE_LOW: '백업할 디스크의 여유 공간이 부족합니다.',
    EXPORT_DESTINATION_EXISTS:
      '기존 파일·폴더는 덮어쓰지 않습니다. 새 ZIP 이름이나 다른 상위 폴더를 선택해주세요.',
    BACKUP_SOURCE_CHANGED:
      '백업 중 데이터가 변경됐습니다. 다른 작업을 마치고 다시 시도해주세요.',
    BACKUP_CLEANUP_UNCONFIRMED:
      '백업 작업의 정리 완료를 확인하지 못했습니다. 새 ZIP과 임시 폴더를 확인해주세요.',
    BACKUP_TIMEOUT: '백업 시간 제한을 넘었습니다. 디스크 상태를 확인해주세요.',
    BACKUP_HASH_INVALID:
      '백업 ZIP의 파일 지문이 다릅니다. 이 파일로 복원하지 마세요.',
    BACKUP_MANIFEST_INVALID: '지원하는 GuitarLab 로컬 백업 ZIP이 아닙니다.',
    BACKUP_DATABASE_INVALID:
      '백업 데이터베이스 검사를 통과하지 못했습니다. 기존 데이터는 유지했습니다.',
    BACKUP_DATABASE_VERSION:
      '현재 앱에서 지원하는 v8/v9 백업 데이터베이스가 아닙니다.',
    AI_RUNTIME_INTEGRITY: '내장 실행 환경의 무결성을 확인하지 못했습니다.',
  };
  return messages[code] ?? '백업을 완료하지 못했습니다. 원본은 유지했습니다.';
}
