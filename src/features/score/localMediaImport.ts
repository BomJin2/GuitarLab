import { readBlob } from '../../shared/readBlob';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
} from './alphaTabAdapter';
import type { ScoreSession } from './scoreSession';
import { decodeScoreJson } from './scoreJson';
import { renderNormalized, validateEditable } from './normalizedNotation';

export function importScoreSession(
  bytes: Uint8Array,
  name: string,
): ScoreSession {
  if (/\.json$/i.test(name)) {
    const document = decodeScoreJson(bytes);
    const bars = validateEditable(document);
    if (
      document.tracks.some((track) =>
        track.notes.some(
          (note) =>
            note.measureIndex !==
            bars.findIndex(
              (bar) => bar.start <= note.startTick && note.startTick < bar.end,
            ),
        ),
      )
    )
      throw new Error('SCORE_JSON_INVALID');
    return {
      ...renderNormalized(document),
      document,
      originalBytes: bytes,
      activeTrackIndex: 0,
    };
  }
  const score = importScore(bytes);
  const playbackLookup = buildPlaybackLookup(score);
  return {
    score,
    playbackLookup,
    document: normalizeScore(score, playbackLookup),
    originalBytes: bytes,
    activeTrackIndex: 0,
  };
}

export type LocalMediaKind = 'score' | 'audio';
type ImportedLocalMedia =
  | { kind: 'score'; session: ScoreSession }
  | { kind: 'audio'; file: File };

export async function importLocalMedia(
  kind: LocalMediaKind,
  file: File,
  signal: AbortSignal,
): Promise<ImportedLocalMedia> {
  if (kind === 'score') {
    if (
      !/\.(json|musicxml|xml|gp|gp3|gp4|gp5|gpx)$/i.test(file.name) ||
      !file.size ||
      file.size > 8 * 1024 * 1024
    )
      throw new Error('invalid-score');
    const bytes = await readBlob(file, signal);
    signal.throwIfAborted();
    return {
      kind: 'score',
      session: importScoreSession(bytes, file.name),
    };
  }
  if (
    !/\.(wav|mp3)$/i.test(file.name) ||
    !file.size ||
    file.size > 256 * 1024 * 1024
  )
    throw new Error('invalid-audio');
  const header = await readBlob(file.slice(0, 12), signal);
  const text = new TextDecoder().decode(header);
  if (
    !(text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE') &&
    !text.startsWith('ID3') &&
    !(header[0] === 255 && ((header[1] ?? 0) & 224) === 224)
  )
    throw new Error('invalid-audio');
  return { kind: 'audio', file };
}
