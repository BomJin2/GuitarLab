import type { RecordedPitches } from '../features/recordings/recordedPitches';
import { recordingFixture } from './recordingFixture';

export function recordedPitchesFixture(): RecordedPitches {
  const take = recordingFixture();
  return {
    schemaVersion: 1,
    projectId: take.projectId,
    takeId: take.id,
    startMs: 1000,
    durationMs: 400,
    frames: 19200,
    sampleRate: 48000,
    method: 'SPECTRAL_PEAK_EXPERIMENTAL',
    state: 'CANDIDATES',
    rmsDbfs: -20,
    pitches: [
      { midi: 60.03, salience: 1 },
      { midi: 64.02, salience: 0.8 },
      { midi: 67, salience: 0.7 },
    ],
    warnings: ['EXPERIMENTAL', 'OCTAVE_VOICES_AMBIGUOUS'],
  };
}
