import xml from '../../public/fixtures/dual-guitar.musicxml?raw';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
} from '../features/score/alphaTabAdapter';
import type { ScoreSession } from '../features/score/scoreSession';

export function dualGuitarSession(): ScoreSession {
  const originalBytes = new TextEncoder().encode(xml);
  const score = importScore(originalBytes);
  const playbackLookup = buildPlaybackLookup(score);
  const document = normalizeScore(score, playbackLookup);
  return {
    score,
    playbackLookup,
    document,
    originalBytes,
    activeTrackIndex: 0,
    activePerformanceTrackId: document.tracks[0]?.id,
  };
}
