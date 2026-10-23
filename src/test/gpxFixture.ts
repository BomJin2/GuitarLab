// 자체 GPIF를 GPX sector/리터럴·역참조 형식으로 감싸는 회귀용 자료입니다.
export function bcfsFixture(files: Record<string, Uint8Array>): Uint8Array {
  const entries = Object.entries(files);
  const sectors =
    1 +
    entries.reduce(
      (count, [, bytes]) => count + 1 + Math.ceil(bytes.length / 4096),
      0,
    );
  const data = new Uint8Array(4 + sectors * 4096);
  data.set([66, 67, 70, 83]);
  const body = data.subarray(4);
  body.fill(255, 0, 4096);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let sector = 1;
  for (const [name, bytes] of entries) {
    const entry = sector * 4096;
    view.setUint32(entry, 2, true);
    body.set(new TextEncoder().encode(name), entry + 4);
    view.setUint32(entry + 140, bytes.length, true);
    sector++;
    for (
      let part = 0;
      part < Math.ceil(bytes.length / 4096);
      part++, sector++
    ) {
      view.setUint32(entry + 148 + part * 4, sector, true);
      body.set(bytes.subarray(part * 4096, (part + 1) * 4096), sector * 4096);
    }
  }
  return data;
}

export function bcfzFixture(data: Uint8Array): Uint8Array {
  const encoded = new Uint8Array(data.length * 2 + 8);
  encoded.set([66, 67, 70, 90]);
  new DataView(encoded.buffer).setUint32(4, data.length, true);
  let bit = 64;
  const write = (value: number, count: number, reversed = false) => {
    for (let i = 0; i < count; i++, bit++)
      encoded[bit >>> 3] =
        (encoded[bit >>> 3] ?? 0) |
        (((value >>> (reversed ? i : count - i - 1)) & 1) << (7 - (bit & 7)));
  };
  for (let i = 0; i < data.length; i++) {
    if (i > 0 && data[i] === data[i - 1]) {
      write(1, 1);
      write(1, 4);
      write(1, 1);
      write(1, 1);
    } else {
      write(0, 1);
      write(1, 2, true);
      write(data[i] ?? 0, 8);
    }
  }
  return encoded.slice(0, Math.ceil(bit / 8));
}
