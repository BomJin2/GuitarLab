import xml from '../../public/fixtures/standard.musicxml?raw';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
} from '../features/score/alphaTabAdapter';
import type { ScoreSession } from '../features/score/scoreSession';
export function scoreEditingFixture(): ScoreSession {
  const originalBytes = new TextEncoder().encode(xml);
  const score = importScore(originalBytes);
  const playbackLookup = buildPlaybackLookup(score);
  return {
    originalBytes,
    score,
    playbackLookup,
    document: normalizeScore(score, playbackLookup),
    activeTrackIndex: 0,
  };
}
