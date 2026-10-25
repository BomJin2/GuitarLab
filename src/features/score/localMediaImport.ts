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

export function localMediaKind(name: string): LocalMediaKind | null {
  if (/\.(json|musicxml|xml|gp|gp3|gp4|gp5|gpx)$/i.test(name)) return 'score';
  if (/\.(wav|mp3)$/i.test(name)) return 'audio';
  return null;
}
export function validateLocalMediaFile(kind: LocalMediaKind, file: File) {
  if (
    localMediaKind(file.name) !== kind ||
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > (kind === 'score' ? 8 : 256) * 1024 * 1024
  )
    throw new Error(kind === 'score' ? 'invalid-score' : 'invalid-audio');
}
type ImportedLocalMedia =
  | { kind: 'score'; session: ScoreSession }
  | { kind: 'audio'; file: File };

export async function importLocalMedia(
  kind: LocalMediaKind,
  file: File,
  signal: AbortSignal,
): Promise<ImportedLocalMedia> {
  validateLocalMediaFile(kind, file);
  if (kind === 'score') {
    const bytes = await readBlob(file, signal);
    signal.throwIfAborted();
    return {
      kind: 'score',
      session: importScoreSession(bytes, file.name),
    };
  }
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
