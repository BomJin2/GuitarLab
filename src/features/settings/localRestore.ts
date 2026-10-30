import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  isUuid,
  localBackupByteLimit,
  runStorageJob,
  type JobSnapshot,
} from '../library/projects';
import { isRecord, isSafeUnsigned } from '../../shared/validation';

export type RestoreState =
  | 'SCHEDULED'
  | 'APPLYING'
  | 'COMPLETED'
  | 'ROLLED_BACK'
  | 'CANCELED'
  | 'FAILED';
export type LocalRestoreStatus =
  | { schemaVersion: 1; state: 'IDLE' }
  | {
      schemaVersion: 1;
      state: RestoreState;
      recoveryId: string;
      files: number;
      bytes: number;
      externalReferencesNotCopied: number;
      databaseVersion: 8 | 9 | 10;
      restartRequired: boolean;
      errorCode:
        | 'RESTORE_ABORTED'
        | 'RESTORE_PREPARATION_FAILED'
        | 'RESTORE_ROLLED_BACK'
        | null;
    };
export function decodeLocalRestore(value: unknown): LocalRestoreStatus {
  if (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.state === 'IDLE' &&
    Object.keys(value).length === 2
  )
    return { schemaVersion: 1, state: 'IDLE' };
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    Object.keys(value).length !== 9 ||
    ![
      'SCHEDULED',
      'APPLYING',
      'COMPLETED',
      'ROLLED_BACK',
      'CANCELED',
      'FAILED',
    ].includes(String(value.state)) ||
    !isUuid(value.recoveryId) ||
    !isSafeUnsigned(value.files, 9999) ||
    value.files === 0 ||
    !isSafeUnsigned(value.bytes, localBackupByteLimit) ||
    value.bytes === 0 ||
    !isSafeUnsigned(value.externalReferencesNotCopied, 100000) ||
    (value.databaseVersion !== 8 &&
      value.databaseVersion !== 9 &&
      value.databaseVersion !== 10) ||
    value.restartRequired !== (value.state === 'SCHEDULED')
  )
    throw new Error('RESTORE_PROTOCOL_INVALID');
  const state = value.state;
  const code = value.errorCode;
  if (
    (state === 'FAILED'
      ? code !== 'RESTORE_ABORTED' && code !== 'RESTORE_PREPARATION_FAILED'
      : state === 'ROLLED_BACK'
        ? code !== 'RESTORE_ROLLED_BACK'
        : code !== null) ||
    (state !== 'SCHEDULED' &&
      state !== 'APPLYING' &&
      state !== 'COMPLETED' &&
      state !== 'ROLLED_BACK' &&
      state !== 'CANCELED' &&
      state !== 'FAILED') ||
    (code !== null &&
      code !== 'RESTORE_ABORTED' &&
      code !== 'RESTORE_PREPARATION_FAILED' &&
      code !== 'RESTORE_ROLLED_BACK')
  )
    throw new Error('RESTORE_PROTOCOL_INVALID');
  return {
    schemaVersion: 1,
    state,
    recoveryId: value.recoveryId,
    files: value.files,
    bytes: value.bytes,
    externalReferencesNotCopied: value.externalReferencesNotCopied,
    databaseVersion: value.databaseVersion,
    restartRequired: value.restartRequired,
    errorCode: code,
  };
}
export const localRestoreApi = {
  available: isTauri,
  async status() {
    return decodeLocalRestore(
      await invoke<unknown>('get_local_restore_status', {
        request: { schemaVersion: 1 },
      }),
    );
  },
  async schedule(signal: AbortSignal, progress: (job: JobSnapshot) => void) {
    return decodeLocalRestore(
      await runStorageJob(
        'restore_local_backup',
        { consentReplaceLocalData: true },
        signal,
        progress,
        { waitForCancellation: true },
      ),
    );
  },
  async cancel(
    recoveryId: string,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ) {
    return decodeLocalRestore(
      await runStorageJob(
        'cancel_local_restore',
        { recoveryId, confirmCancel: true },
        signal,
        progress,
        { waitForCancellation: true },
      ),
    );
  },
};
export function restoreError() {
  return '복원 처리를 확인하지 못했습니다. 예약 상태를 다시 읽고 확인해주세요. 준비본·백업·복구 폴더는 자동 삭제하지 않습니다.';
}
