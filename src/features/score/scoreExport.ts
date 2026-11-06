import { isTauri } from '@tauri-apps/api/core';
import type { ScoreDocument } from '../../entities/score';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import { isRecord, isSafeUnsigned } from '../../shared/validation';
import { runStorageJob, type JobSnapshot } from '../library/projects';
import {
  renderNormalized,
  toNormalizedGp7,
  toNormalizedMusicXml,
  scoreXmlLimitMessage,
} from './normalizedNotation';

export type ScoreExportFormat = 'JSON' | 'MUSICXML' | 'GP7';
// docs/12 주법 편집 v2: MusicXML에는 v2 주법을 담지 않습니다.
const musicXmlDropped = new Set<string>([
  'HAMMER',
  'SLIDE_LEGATO',
  'SLIDE_SHIFT',
  'HARMONIC_NATURAL',
  'LET_RING',
]);
/** 내보내기 형식에 담기지 않는 내용의 안내(편집·기록 화면에 표시). */
export function exportLossWarnings(document: ScoreDocument): string[] {
  const notes = document.tracks.flatMap((t) => t.notes);
  return [
    ...(notes.some((n) => n.techniques?.some((x) => musicXmlDropped.has(x)))
      ? [
          'MusicXML에는 해머온·슬라이드·하모닉·렛링이 빠집니다 · GP7로 내보내면 유지됩니다',
        ]
      : []),
    ...(notes.some((n) => n.playbackTick !== undefined)
      ? [
          '스윙 소리 시각은 MusicXML에 담기지 않고 GP7로는 내보낼 수 없습니다 · JSON으로 내보내면 유지됩니다',
        ]
      : []),
  ];
}
export const scoreExportApi = {
  available: isTauri,
  async export(
    document: ScoreDocument,
    format: ScoreExportFormat,
    signal: AbortSignal,
    progress: (value: JobSnapshot) => void,
  ) {
    if (signal.aborted) throw new DOMException('악보 출력 취소', 'AbortError');
    // 큰 악보의 그리기·GP7 왕복은 수 초 걸릴 수 있어, 먼저 화면에 "출력 중"이 그려지게 한 번 양보합니다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal.aborted) throw new DOMException('악보 출력 취소', 'AbortError');
    const normalized: ScoreDocument = {
      ...decodeScoreDocument(document),
      renderSource: 'NORMALIZED',
    };
    // GP7은 toNormalizedGp7 안에서 그리므로 한 번만 그립니다.
    const gp7 = format === 'GP7' ? toNormalizedGp7(normalized) : null;
    if (!gp7) renderNormalized(normalized);
    const result = await runStorageJob(
      'export_score_file',
      {
        format,
        document: normalized,
        ...(format === 'MUSICXML'
          ? { musicXml: toNormalizedMusicXml(normalized) }
          : {}),
        ...(gp7 ? { gp7: Array.from(gp7) } : {}),
      },
      signal,
      progress,
      { waitForCancellation: true },
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
  if (code === 'SCORE_XML_LIMIT') return scoreXmlLimitMessage;
  if (code === 'SCORE_GP7_SWING')
    return '스윙 소리 시각은 GP7에 담을 수 없어 내보내지 않았습니다. JSON으로 내보내세요.';
  if (code === 'EXPORT_DESTINATION_EXISTS')
    return '기존 파일은 덮어쓰지 않습니다. 새 파일명을 선택하세요.';
  if (code === 'STORAGE_BUSY')
    return '다른 파일 작업이나 선택 창을 먼저 마치세요.';
  if (code === 'RECORDING_BUSY') return '녹음을 저장한 뒤 악보를 출력하세요.';
  if (code === 'DISK_SPACE_LOW')
    return '저장 공간이 부족합니다. 다른 위치를 선택하세요.';
  return '악보 파일을 출력하지 못했습니다. 기존 원본은 보존했습니다. 파일명과 저장 위치를 확인하세요.';
}
