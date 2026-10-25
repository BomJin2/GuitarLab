import { isTauri } from '@tauri-apps/api/core';
import type { ScoreDocument } from '../../entities/score';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import { isRecord, isSafeUnsigned } from '../../shared/validation';
import { runStorageJob, type JobSnapshot } from '../library/projects';
import { renderNormalized, toNormalizedMusicXml } from './normalizedNotation';

export type ScoreExportFormat = 'JSON' | 'MUSICXML';
export const scoreExportApi = {
  available: isTauri,
  async export(
    document: ScoreDocument,
    format: ScoreExportFormat,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    if (signal.aborted) throw new DOMException('악보 출력 취소', 'AbortError');
    const normalized: ScoreDocument = {
      ...decodeScoreDocument(document),
      renderSource: 'NORMALIZED',
    };
    renderNormalized(normalized);
    const result = await runStorageJob(
      'export_score_file',
      {
        format,
        document: normalized,
        ...(format === 'MUSICXML'
          ? { musicXml: toNormalizedMusicXml(normalized) }
          : {}),
      },
      signal,
      progress,
    );
    if (
      !isRecord(result) ||
      result.schemaVersion !== 1 ||
      result.format !== format ||
      !isSafeUnsigned(result.bytes, 8 * 1024 * 1024) ||
      result.bytes === 0
    )
      throw new Error('SCORE_EXPORT_CONTRACT_INVALID');
    return { format, bytes: result.bytes };
  },
};
export function scoreExportError(cause: unknown) {
  const code =
    cause instanceof Error ? cause.message : isRecord(cause) ? cause.code : '';
  if (code === 'EXPORT_DESTINATION_EXISTS')
    return '기존 파일은 덮어쓰지 않습니다. 새 파일명을 선택하세요.';
  if (code === 'STORAGE_BUSY')
    return '다른 파일 작업이나 선택 창을 먼저 마치세요.';
  if (code === 'RECORDING_BUSY') return '녹음을 저장한 뒤 악보를 출력하세요.';
  if (code === 'DISK_SPACE_LOW')
    return '저장 공간이 부족합니다. 다른 위치를 선택하세요.';
  return '악보 파일을 출력하지 못했습니다. 기존 원본은 보존했습니다. 파일명과 저장 위치를 확인하세요.';
}
