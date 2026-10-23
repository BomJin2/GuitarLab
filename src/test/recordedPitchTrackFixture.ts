import type { RecordedPitchTrack } from '../features/recordings/recordedPitchTrack';
import { recordingFixture } from './recordingFixture';
export function recordedPitchTrackFixture(): RecordedPitchTrack {
  const take = recordingFixture();
  return {
    schemaVersion: 2,
    projectId: take.projectId,
    takeId: take.id,
    startMs: 1000,
    durationMs: 1000,
    frames: 48000,
    sampleRate: 48000,
    method: 'MONOPHONIC_TRACK_EXPERIMENTAL',
    motion: 'RISING',
    coverage: 1,
    deltaCents: 175,
    minConfidence: 0.99,
    rmsDbfs: -20,
    points: Array.from({ length: 38 }, (_, index) => {
      const timeMs = (((index * 400 + 511.5) * 3 + 1) * 1000) / 48000;
      return { timeMs, pitchMidi: 52 + (2 * timeMs) / 1000, confidence: 0.99 };
    }),
    warnings: [
      'EXPERIMENTAL',
      'MONOPHONIC_ONLY',
      'NOT_TECHNIQUE_CLASSIFICATION',
    ],
    oscillation: null,
  };
}

export function recordedOscillationFixture(): RecordedPitchTrack {
  const track = recordedPitchTrackFixture();
  const points = track.points.map((point) => ({
    ...point,
    pitchMidi: 64 + 0.4 * Math.sin((2 * Math.PI * 6 * point.timeMs) / 1000),
  }));
  const pitches = points.map((point) => point.pitchMidi);
  const median = (values: number[]) =>
    values.slice(0, 3).sort((a, b) => a - b)[1] ?? 0;
  const first = points[0],
    last = points.at(-1);
  if (!first || !last) throw new Error('자체 궤적 필요');
  return {
    ...track,
    points,
    motion: 'OSCILLATING',
    deltaCents: (median([...pitches].reverse()) - median(pitches)) * 100,
    oscillation: {
      rateHz: 6,
      depthCents: 80,
      cycles: ((last.timeMs - first.timeMs) * 6) / 1000,
      fit: 0.96,
    },
  };
}
