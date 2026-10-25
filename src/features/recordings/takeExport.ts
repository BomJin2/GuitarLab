import { isTauri } from '@tauri-apps/api/core';
import { isRecord, isSafeUnsigned } from '../../shared/validation';
import { runStorageJob, type JobSnapshot } from '../library/projects';
import { decodeTake, recordingError, type RecordedTake } from './recordings';

export function decodeTakeExport(value: unknown, take: RecordedTake) {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    value.schemaVersion !== 1 ||
    value.state !== 'RECORDING_EXPORTED' ||
    value.projectId !== take.projectId ||
    value.takeId !== take.id ||
    !isSafeUnsigned(value.bytes, 256 * 1024 * 1024) ||
    value.bytes !== 58 + take.frames * 4 ||
    value.sha256 !== take.sha256 ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256)
  )
    throw new Error('TAKE_EXPORT_CONTRACT_INVALID');
  return { bytes: value.bytes, sha256: value.sha256 };
}
export const takeExportApi = {
  available: isTauri,
  async export(
    take: RecordedTake,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    const checked = decodeTake(take);
    if (checked.state !== 'READY') throw new Error('TAKE_NOT_READY');
    return decodeTakeExport(
      await runStorageJob(
        'export_recording',
        {
          projectId: checked.projectId,
          takeId: checked.id,
        },
        signal,
        progress,
        { waitForCancellation: true },
      ),
      checked,
    );
  },
};
export function takeExportError(cause: unknown): string {
  const code =
    cause instanceof Error ? cause.message : isRecord(cause) ? cause.code : '';
  if (code === 'EXPORT_DESTINATION_EXISTS')
    return '기존 파일은 덮어쓰지 않습니다. 새 WAV 파일명을 선택하세요.';
  if (code === 'DISK_SPACE_LOW')
    return '저장 공간이 부족합니다. 다른 위치를 선택하세요.';
  if (code === 'STORAGE_BUSY')
    return '다른 파일 작업이나 선택 창을 먼저 마치세요.';
  if (code === 'TAKE_EXPORT_CONTRACT_INVALID')
    return '내보내기 응답이 선택한 원본과 달라 성공으로 표시하지 않았습니다.';
  return recordingError(cause);
}
