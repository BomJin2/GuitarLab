import type { NoteEvent, ScoreDocument, ScoreTrack, SyncAnchor } from './score';
import { isRecord, isNumberWithin, isSafeUnsigned } from '../shared/validation';
import { isGuitarPartRole } from './guitarRoles';
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 128 &&
  [...v].every((char) => char.charCodeAt(0) >= 32);
const title = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && [...v].length <= 200;
function note(v: unknown): v is NoteEvent {
  return (
    isRecord(v) &&
    id(v.id) &&
    id(v.trackId) &&
    isSafeUnsigned(v.measureIndex, 100000) &&
    isSafeUnsigned(v.startTick) &&
    isSafeUnsigned(v.durationTicks) &&
    v.durationTicks > 0 &&
    v.durationTicks <= Number.MAX_SAFE_INTEGER - v.startTick &&
    isSafeUnsigned(v.pitchMidi, 127) &&
    (v.stringIndex === undefined ||
      (isSafeUnsigned(v.stringIndex, 12) && v.stringIndex > 0)) &&
    (v.fret === undefined || isSafeUnsigned(v.fret, 36)) &&
    (v.notationNoteId === undefined || id(v.notationNoteId)) &&
    (v.attack === undefined || typeof v.attack === 'boolean') &&
    (v.judgementSupport === undefined ||
      v.judgementSupport === 'UNSUPPORTED') &&
    (v.source === 'manual' || v.source === 'import' || v.source === 'ai')
  );
}
function track(v: unknown): v is ScoreTrack {
  if (
    !isRecord(v) ||
    !id(v.id) ||
    !title(v.name) ||
    (v.instrument !== undefined &&
      v.instrument !== 'GUITAR' &&
      v.instrument !== 'OTHER') ||
    (v.role !== undefined && !isGuitarPartRole(v.role)) ||
    !Array.isArray(v.tuningMidi) ||
    v.tuningMidi.length > 12 ||
    !v.tuningMidi.every((p: unknown) => isSafeUnsigned(p, 127)) ||
    !Array.isArray(v.notes) ||
    v.notes.length > 100000 ||
    !v.notes.every(note)
  )
    return false;
  const count = v.tuningMidi.length;
  return v.notes.every(
    (n) =>
      n.trackId === v.id &&
      (n.stringIndex === undefined || n.stringIndex <= count),
  );
}
function anchor(v: unknown): v is SyncAnchor {
  return (
    isRecord(v) &&
    isSafeUnsigned(v.scoreTick) &&
    isNumberWithin(v.audioTimeMs, 0, 86400000)
  );
}
function tempo(v: unknown): v is ScoreDocument['tempoMap'][number] {
  return (
    isRecord(v) && isSafeUnsigned(v.tick) && isNumberWithin(v.bpm, 10, 600)
  );
}
function signature(v: unknown): v is ScoreDocument['timeSignatures'][number] {
  return (
    isRecord(v) &&
    isSafeUnsigned(v.tick) &&
    isSafeUnsigned(v.numerator, 32) &&
    v.numerator > 0 &&
    isSafeUnsigned(v.denominator) &&
    [1, 2, 4, 8, 16, 32].includes(v.denominator)
  );
}
function score(v: unknown): v is ScoreDocument {
  return (
    isRecord(v) &&
    v.schemaVersion === 1 &&
    (v.renderSource === undefined || v.renderSource === 'NORMALIZED') &&
    id(v.id) &&
    title(v.title) &&
    isSafeUnsigned(v.ppq, 1000000) &&
    v.ppq > 0 &&
    Array.isArray(v.tracks) &&
    v.tracks.length > 0 &&
    v.tracks.length <= 128 &&
    v.tracks.every(track) &&
    Array.isArray(v.tempoMap) &&
    v.tempoMap.length > 0 &&
    v.tempoMap.length <= 10000 &&
    v.tempoMap.every(tempo) &&
    v.tempoMap[0]?.tick === 0 &&
    v.tempoMap.every(
      (p, i, points) => i === 0 || p.tick > (points[i - 1]?.tick ?? -1),
    ) &&
    Array.isArray(v.timeSignatures) &&
    v.timeSignatures.length > 0 &&
    v.timeSignatures.length <= 20000 &&
    v.timeSignatures.every(signature) &&
    v.timeSignatures[0]?.tick === 0 &&
    v.timeSignatures.every(
      (p, i, points) => i === 0 || p.tick > (points[i - 1]?.tick ?? -1),
    ) &&
    Array.isArray(v.syncAnchors) &&
    v.syncAnchors.length >= 2 &&
    v.syncAnchors.length <= 10000 &&
    v.syncAnchors.every(anchor) &&
    v.syncAnchors.every(
      (p, i, points) =>
        i === 0 ||
        (p.scoreTick > (points[i - 1]?.scoreTick ?? -1) &&
          p.audioTimeMs > (points[i - 1]?.audioTimeMs ?? -1)),
    )
  );
}
export function decodeScoreDocument(value: unknown): ScoreDocument {
  if (!score(value)) throw new Error('PROJECT_CONTRACT_INVALID');
  const tracks = new Set<string>();
  const notes = new Set<string>();
  for (const track of value.tracks) {
    if (tracks.has(track.id)) throw new Error('PROJECT_CONTRACT_INVALID');
    tracks.add(track.id);
    for (const note of track.notes) {
      if (notes.has(note.id) || notes.size >= 100000)
        throw new Error('PROJECT_CONTRACT_INVALID');
      notes.add(note.id);
    }
  }
  return value;
}
