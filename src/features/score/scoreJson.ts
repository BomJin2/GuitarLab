import { parseUniqueJson } from '../../shared/json';
import type { ScoreDocument } from '../../entities/score';
import { decodeScoreDocument } from '../../entities/scoreValidation';

export function isScoreJson(bytes: Uint8Array): boolean {
  return bytes.find((byte) => ![9, 10, 13, 32].includes(byte)) === 123;
}

function fields(value: object, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('SCORE_JSON_INVALID');
}

export function decodeScoreJson(bytes: Uint8Array): ScoreDocument {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024 || bytes[0] === 239)
    throw new Error('SCORE_JSON_INVALID');
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = parseUniqueJson(text);
    const document = decodeScoreDocument(value);
    if (document.renderSource !== 'NORMALIZED')
      throw new Error('SCORE_JSON_INVALID');
    fields(document, [
      'schemaVersion',
      'renderSource',
      'id',
      'title',
      'ppq',
      'tempoMap',
      'timeSignatures',
      'syncAnchors',
      'tracks',
    ]);
    for (const point of document.tempoMap) fields(point, ['tick', 'bpm']);
    for (const signature of document.timeSignatures)
      fields(signature, ['tick', 'numerator', 'denominator']);
    for (const anchor of document.syncAnchors)
      fields(anchor, ['scoreTick', 'audioTimeMs']);
    const identifiers = [document.id];
    const titles = [document.title];
    for (const track of document.tracks) {
      fields(track, [
        'id',
        'name',
        'tuningMidi',
        'notes',
        'instrument',
        'role',
      ]);
      identifiers.push(track.id);
      titles.push(track.name);
      for (const note of track.notes) {
        fields(note, [
          'id',
          'trackId',
          'measureIndex',
          'startTick',
          'durationTicks',
          'pitchMidi',
          'stringIndex',
          'fret',
          'notationNoteId',
          'attack',
          'judgementSupport',
          'source',
        ]);
        identifiers.push(note.id, note.trackId);
        if (note.notationNoteId !== undefined)
          identifiers.push(note.notationNoteId);
      }
    }
    const encoder = new TextEncoder();
    if (
      [...identifiers, ...titles].some((text) => /\p{Cc}/u.test(text)) ||
      identifiers.some((text) => encoder.encode(text).length > 128)
    )
      throw new Error('SCORE_JSON_INVALID');
    return document;
  } catch {
    throw new Error('SCORE_JSON_INVALID');
  }
}
