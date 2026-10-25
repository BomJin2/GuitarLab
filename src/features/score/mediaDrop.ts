import { localMediaKind, validateLocalMediaFile } from './localMediaImport';

export function droppedLocalMedia(transfer: DataTransfer) {
  if (
    transfer.files.length !== 1 ||
    Array.from(transfer.items).some(
      (item) => item.kind !== 'file' || item.webkitGetAsEntry?.()?.isDirectory,
    )
  )
    throw new Error('MEDIA_DROP_SINGLE_FILE_REQUIRED');
  const file = transfer.files[0];
  if (!file) throw new Error('MEDIA_DROP_SINGLE_FILE_REQUIRED');
  const kind = localMediaKind(file.name);
  if (!kind) throw new Error('MEDIA_DROP_UNSUPPORTED');
  validateLocalMediaFile(kind, file);
  return { kind, file };
}
export function mediaDropError(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : '';
  if (code === 'invalid-score')
    return '악보는 8MiB 이하의 비어 있지 않은 파일 한 개를 놓아주세요.';
  if (code === 'invalid-audio')
    return '음원은 256MiB 이하의 비어 있지 않은 파일 한 개를 놓아주세요.';
  return '악보(GP/MusicXML/JSON) 또는 음원(WAV/MP3) 파일 한 개만 놓아주세요. 폴더·URL·여러 파일은 받지 않습니다.';
}
