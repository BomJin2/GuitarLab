import { Unzip, UnzipInflate, zipSync } from 'fflate';

const expandedLimit = 32 * 1024 * 1024;
const limitError = () => new Error('SCORE_ARCHIVE_LIMIT');
const invalidError = () => new Error('SCORE_ARCHIVE_INVALID');

export function scoreArchiveErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.message === 'SCORE_ARCHIVE_LIMIT')
    return '압축 악보는 해제 후32MiB·항목512개 이하여야 합니다. 기존 악보는 유지했습니다.';
  if (error.message === 'SCORE_ARCHIVE_INVALID')
    return '압축 악보가 손상됐거나 지원하지 않는 형식입니다. 기존 악보는 유지했습니다.';
  return null;
}

function boundedZip(data: Uint8Array): Uint8Array {
  const files = new Map<string, Uint8Array>();
  const names = new Set<string>();
  let expanded = 0;
  let completed = 0;
  let failure: Error | null = null;
  const unzip = new Unzip((file) => {
    if (names.has(file.name) || !file.name) throw invalidError();
    names.add(file.name);
    if (names.size > 512 || (file.originalSize ?? 0) > expandedLimit)
      throw limitError();
    if (file.compression !== 0 && file.compression !== 8) throw invalidError();
    const chunks: Uint8Array[] = [];
    let length = 0;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) {
        failure = invalidError();
        return;
      }
      expanded += chunk.byteLength;
      if (expanded > expandedLimit) {
        failure = limitError();
        return;
      }
      chunks.push(chunk);
      length += chunk.byteLength;
      if (final) {
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const part of chunks) {
          bytes.set(part, offset);
          offset += part.length;
        }
        files.set(file.name, bytes);
        chunks.length = 0;
        completed++;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // 작은 입력 청크로 한 번의 해제량을 제한하고 매 push 뒤 실제 누적량을 확인합니다.
  for (let offset = 0; offset < data.length; offset += 1024) {
    const end = Math.min(offset + 1024, data.length);
    unzip.push(data.subarray(offset, end), end === data.length);
    if (failure) throw failure;
  }
  if (!names.size || completed !== names.size) throw invalidError();
  return zipSync(Object.fromEntries(files), { level: 0 });
}

function decompressGpx(data: Uint8Array): Uint8Array {
  if (data.length < 8) throw invalidError();
  const size = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength,
  ).getUint32(4, true);
  if (size < 4) throw invalidError();
  if (size > expandedLimit) throw limitError();
  const output = new Uint8Array(size);
  let bit = 64;
  let position = 0;
  const read = (count: number, reversed = false) => {
    if (bit + count > data.length * 8) throw invalidError();
    let value = 0;
    for (let i = 0; i < count; i++, bit++) {
      const one = ((data[bit >>> 3] ?? 0) >>> (7 - (bit & 7))) & 1;
      value |= one << (reversed ? i : count - i - 1);
    }
    return value;
  };
  while (position < size) {
    if (read(1)) {
      const width = read(4);
      const distance = read(width, true);
      const length = Math.min(distance, read(width, true));
      if (!length || distance > position || position + length > size)
        throw invalidError();
      output.set(
        output.subarray(position - distance, position - distance + length),
        position,
      );
      position += length;
    } else {
      const length = read(2, true);
      if (!length || position + length > size) throw invalidError();
      for (let i = 0; i < length; i++) output[position++] = read(8);
    }
  }
  return output;
}

function boundedGpx(data: Uint8Array): Uint8Array {
  const block = data[3] === 90 ? decompressGpx(data) : data;
  if (new TextDecoder('ascii').decode(block.subarray(0, 4)) !== 'BCFS')
    throw invalidError();
  const body = block.subarray(4);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const integer = (offset: number) => {
    if (offset < 0 || offset + 4 > body.length) throw invalidError();
    return view.getUint32(offset, true);
  };
  const files = new Map<string, Uint8Array>();
  let total = 0;
  let references = 0;
  for (let entry = 4096; entry + 4 <= body.length; ) {
    let next = entry + 4096;
    if (integer(entry) === 2) {
      if (entry + 148 > body.length) throw invalidError();
      let name = '';
      for (const byte of body.subarray(entry + 4, entry + 131)) {
        if (!byte) break;
        name += String.fromCharCode(byte);
      }
      if (!name || files.has(name)) throw invalidError();
      const size = integer(entry + 140);
      total += size;
      if (total > expandedLimit || files.size >= 512) throw limitError();
      const bytes = new Uint8Array(size);
      let copied = 0;
      for (let pointer = entry + 148; ; pointer += 4) {
        const sector = integer(pointer);
        if (!sector) break;
        if (++references > expandedLimit / 4096) throw limitError();
        const start = sector * 4096;
        const count = Math.min(4096, size - copied);
        if (start >= body.length || start + count > body.length)
          throw invalidError();
        bytes.set(body.subarray(start, start + count), copied);
        copied += count;
        next = start + 4096;
      }
      if (copied !== size || next <= entry) throw invalidError();
      files.set(name, bytes);
    }
    entry = next;
  }
  if (!files.size) throw invalidError();
  return zipSync(Object.fromEntries(files), { level: 0 });
}

export function prepareScoreArchive(data: Uint8Array): Uint8Array {
  if (!data.byteLength || data.byteLength > 8 * 1024 * 1024)
    throw new Error('악보는 8MiB 이하여야 합니다.');
  const signature = new TextDecoder('ascii').decode(data.subarray(0, 4));
  if (!['BCFS', 'BCFZ', 'PK\u0003\u0004'].includes(signature)) return data;
  try {
    return signature === 'PK\u0003\u0004' ? boundedZip(data) : boundedGpx(data);
  } catch (cause) {
    if (
      cause instanceof Error &&
      ['SCORE_ARCHIVE_LIMIT', 'SCORE_ARCHIVE_INVALID'].includes(cause.message)
    )
      throw cause;
    throw invalidError();
  }
}
