// docs/12 "DAW 보기 v1": 파형은 재생기와 같은 Blob을 8 kHz로 디코딩해 구간 최대값만 남깁니다.
const MAX_BYTES = 64 * 1024 * 1024;

/** 채널들의 구간별 최대 절댓값을 실제 크기(1.0 = 최대)로 돌려줍니다. 무음이 꽉 찬 파형으로 보이지 않도록 늘리지 않습니다. */
export function peaksOf(channels: Float32Array[], bins: number): number[] {
  const frames = channels[0]?.length ?? 0;
  const count = Math.min(bins, frames);
  const peaks = new Array<number>(count).fill(0);
  for (const channel of channels)
    for (let i = 0; i < frames; i++) {
      const bin = Math.floor((i * count) / frames);
      const value = Math.min(1, Math.abs(channel[i] ?? 0));
      if (value > (peaks[bin] ?? 0)) peaks[bin] = value;
    }
  return peaks;
}

export type Wave = { peaks: number[]; durationMs: number };

export async function decodePeaks(blob: Blob, bins = 800): Promise<Wave> {
  if (blob.size > MAX_BYTES) throw new Error('WAVEFORM_TOO_LARGE');
  const context = new OfflineAudioContext(1, 1, 8000);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  return {
    peaks: peaksOf(
      Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
        buffer.getChannelData(channel),
      ),
      bins,
    ),
    durationMs: buffer.duration * 1000,
  };
}
