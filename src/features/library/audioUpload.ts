import { invoke } from '@tauri-apps/api/core';
import { readBlob } from '../../shared/readBlob';
import { isRecord, isSafeUnsigned } from '../../shared/validation';
import type { JobSnapshot } from './projects';

const chunkBytes = 1024 * 1024;
export async function sendAudioChunks(
  job: JobSnapshot,
  file: File,
  signal: AbortSignal,
  progress: (job: JobSnapshot) => void,
) {
  const id = new TextEncoder().encode(job.jobId);
  if (id.length !== 36) throw new Error('PROJECT_CONTRACT_INVALID');
  for (let offset = 0; offset < file.size; offset += chunkBytes) {
    signal.throwIfAborted();
    const expected = Math.min(chunkBytes, file.size - offset);
    const bytes = await readBlob(file.slice(offset, offset + expected), signal);
    signal.throwIfAborted();
    if (bytes.length !== expected) throw new Error('FILE_INVALID');
    const body = new Uint8Array(44 + bytes.length);
    body.set(id);
    new DataView(body.buffer).setUint32(36, offset, true);
    body.set(bytes, 44);
    const ack = await invoke<unknown>('append_project_audio_upload', body);
    signal.throwIfAborted();
    if (
      !isRecord(ack) ||
      ack.schemaVersion !== 1 ||
      ack.jobId !== job.jobId ||
      !isSafeUnsigned(ack.receivedBytes, file.size) ||
      ack.receivedBytes !== offset + bytes.length
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    progress({
      ...job,
      totalBytes: file.size,
      completedBytes: Math.floor(ack.receivedBytes / 2),
    });
  }
}
