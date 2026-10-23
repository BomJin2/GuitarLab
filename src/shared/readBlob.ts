export function readBlob(blob: Blob, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('취소됨', 'AbortError'));
      return;
    }
    const reader = new FileReader();
    const cancel = () => reader.abort();
    const cleanup = () => signal.removeEventListener('abort', cancel);
    signal.addEventListener('abort', cancel, { once: true });
    reader.onload = () => {
      cleanup();
      if (reader.result instanceof ArrayBuffer)
        resolve(new Uint8Array(reader.result));
      else reject(new Error('파일 내용을 읽을 수 없습니다.'));
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error('파일 읽기에 실패했습니다.'));
    };
    reader.onabort = () => {
      cleanup();
      reject(new DOMException('취소됨', 'AbortError'));
    };
    reader.readAsArrayBuffer(blob);
  });
}
