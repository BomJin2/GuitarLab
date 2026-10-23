import type { RecordedTake } from '../features/recordings/recordings';
export function recordingFixture(
  patch: Partial<RecordedTake> = {},
): RecordedTake {
  return {
    schemaVersion: 1,
    id: '00000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000002',
    scoreRevisionId: '00000000-0000-4000-8000-000000000003',
    targetScoreTrackId: 'track-0',
    name: '합성 입력 fixture',
    memo: '',
    createdAtMs: 1,
    origin: 'USER_INPUT',
    source: 'INPUT_ONLY',
    state: 'READY',
    sampleRate: 48000,
    channels: 1,
    frames: 192000,
    peak: 0.5,
    droppedFrames: 0,
    warningIntervals: [],
    errorCode: null,
    captureStartSampleIndex: '18446744073709000000',
    captureStartMonotonicNs: '10000000000',
    streamGeneration: 1,
    calibrationRevision: 1,
    calibration: {
      id: '00000000-0000-4000-8000-000000000004',
      key: {
        deviceId: 'synthetic-input-only',
        sampleRate: 48000,
        sampleFormat: 'f32',
        channels: 2,
        channelIndex: 1,
        bufferFrames: 480,
        monitorEnvironment: 'HEADPHONES',
      },
      biasRealMs: 30,
      method: 'MANUAL',
      jitterRealMs: null,
      samplesUsed: null,
    },
    transport: {
      playbackEpoch: 1,
      rate: 0.5,
      backingAssetId: '00000000-0000-4000-8000-000000000005',
    },
    songStartMs: 1000,
    alignmentOffsetMs: -10,
    recoveredFrom: null,
    sha256: 'a'.repeat(64),
    ...patch,
  };
}
export function recordingWaveFixture() {
  const bytes = new ArrayBuffer(58 + 192000 * 4);
  const v = new DataView(bytes);
  const put = (offset: number, text: string) =>
    new Uint8Array(bytes, offset, text.length).set(
      new TextEncoder().encode(text),
    );
  put(0, 'RIFF');
  v.setUint32(4, bytes.byteLength - 8, true);
  put(8, 'WAVEfmt ');
  v.setUint32(16, 18, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 48000, true);
  v.setUint32(28, 192000, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 32, true);
  put(38, 'fact');
  v.setUint32(42, 4, true);
  v.setUint32(46, 192000, true);
  put(50, 'data');
  v.setUint32(54, 192000 * 4, true);
  v.setFloat32(58, 0.5, true);
  return bytes;
}
