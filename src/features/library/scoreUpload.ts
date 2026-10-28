import { readBlob } from '../../shared/readBlob';
import { validateLocalMediaFile } from '../score/localMediaImport';

export async function scoreUploadBody(
  projectId: string,
  file: File,
  signal: AbortSignal,
) {
  validateLocalMediaFile('score', file);
  signal.throwIfAborted();
  const metadata = new TextEncoder().encode(
    JSON.stringify({ schemaVersion: 1, projectId, name: file.name }),
  );
  if (metadata.length > 1024) throw new Error('PROJECT_CONTRACT_INVALID');
  const bytes = await readBlob(file, signal);
  signal.throwIfAborted();
  if (bytes.length !== file.size) throw new Error('FILE_INVALID');
  const body = new Uint8Array(4 + metadata.length + bytes.length);
  new DataView(body.buffer).setUint32(0, metadata.length, true);
  body.set(metadata, 4);
  body.set(bytes, 4 + metadata.length);
  return body;
}
