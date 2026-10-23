export type NoteEvent = {
  id: string;
  trackId: string;
  measureIndex: number;
  startTick: number;
  durationTicks: number;
  pitchMidi: number;
  stringIndex?: number;
  fret?: number;
  notationNoteId?: string;
  attack?: boolean;
  judgementSupport?: 'UNSUPPORTED';
  source: 'manual' | 'import' | 'ai';
};
export type SyncAnchor = { scoreTick: number; audioTimeMs: number };
export type GuitarPartRole =
  | 'LEAD'
  | 'RHYTHM'
  | 'HARMONY'
  | 'GUITAR_OTHER'
  | 'UNKNOWN';
export type ScoreTrack = {
  id: string;
  name: string;
  tuningMidi: number[];
  notes: NoteEvent[];
  instrument?: 'GUITAR' | 'OTHER';
  role?: GuitarPartRole;
};
export type ScoreDocument = {
  schemaVersion: 1;
  renderSource?: 'NORMALIZED';
  id: string;
  title: string;
  ppq: number;
  tempoMap: { tick: number; bpm: number }[];
  timeSignatures: { tick: number; numerator: number; denominator: number }[];
  syncAnchors: SyncAnchor[];
  tracks: ScoreTrack[];
};
