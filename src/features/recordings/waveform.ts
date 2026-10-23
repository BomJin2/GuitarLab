export function waveformPeaks(data: ArrayBuffer, bins = 256) {
  if (
    data.byteLength < 62 ||
    data.byteLength > 256 * 1024 * 1024 ||
    (data.byteLength - 58) % 4 !== 0 ||
    !Number.isInteger(bins) ||
    bins < 1 ||
    bins > 1024
  )
    throw new Error('WAV_INVALID');
  const view = new DataView(data);
  const text = (start: number, length: number) =>
    new TextDecoder().decode(new Uint8Array(data, start, length));
  if (
    text(0, 4) !== 'RIFF' ||
    text(8, 8) !== 'WAVEfmt ' ||
    view.getUint16(20, true) !== 3 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint16(34, true) !== 32 ||
    text(50, 4) !== 'data' ||
    view.getUint32(54, true) !== data.byteLength - 58
  )
    throw new Error('WAV_INVALID');
  const frames = (data.byteLength - 58) / 4;
  const result = new Array<number>(Math.min(bins, frames)).fill(0);
  for (let i = 0; i < frames; i++) {
    const value = view.getFloat32(58 + i * 4, true);
    if (!Number.isFinite(value)) throw new Error('WAV_INVALID');
    const bin = Math.min(
      result.length - 1,
      Math.floor((i * result.length) / frames),
    );
    result[bin] = Math.max(result[bin] ?? 0, Math.abs(value));
  }
  return result;
}
