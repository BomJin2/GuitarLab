import type { model, midi } from '@coderline/alphatab';
import type { ScoreDocument } from '../../entities/score';
export type ScoreSession = {
  score: model.Score;
  document: ScoreDocument;
  playbackLookup: midi.MidiTickLookup;
  originalBytes: Uint8Array;
  activeTrackIndex: number;
  activePerformanceTrackId?: string;
  originalAssetId?: string;
  savedRevision?: {
    projectId: string;
    revisionId: string;
    document: ScoreDocument;
  };
};
