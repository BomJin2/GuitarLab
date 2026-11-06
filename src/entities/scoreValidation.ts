import {
  linkTargets,
  linkTechniques,
  techniqueOrder,
  type NoteEvent,
  type ScoreDocument,
  type ScoreTrack,
  type SyncAnchor,
} from './score';
import { isRecord, isNumberWithin, isSafeUnsigned } from '../shared/validation';
import { isGuitarPartRole } from './guitarRoles';
// Rust project_model의 identifier·title_valid와 같은 규칙입니다(docs/12 "악보 검사 규칙 TS·Rust 일치").
// 제어문자, 짝 없는 서로게이트(Rust는 JSON 읽기에서 거부)
const control = /[\p{Cc}\p{Cs}]/u;
// Rust str::trim과 같은 Unicode White_Space 기준(JS trim은 BOM도 지워 다릅니다)
const visible = /[^\p{White_Space}]/u;
const encoder = new TextEncoder();
// Rust serde(deny_unknown_fields)처럼 정해진 필드만 허용합니다(모르는 필드가 있으면 저장이 거부됨).
const only =
  (...names: string[]) =>
  (v: Record<string, unknown>) =>
    Object.keys(v).every((key) => names.includes(key));
const noteFields = only(
  'id',
  'trackId',
  'measureIndex',
  'startTick',
  'durationTicks',
  'playbackTick',
  'pitchMidi',
  'stringIndex',
  'fret',
  'notationNoteId',
  'attack',
  'judgementSupport',
  'techniques',
  'bendSemitones',
  'source',
);
const trackFields = only(
  'id',
  'name',
  'tuningMidi',
  'notes',
  'instrument',
  'role',
);
const scoreFields = only(
  'schemaVersion',
  'renderSource',
  'id',
  'title',
  'ppq',
  'tempoMap',
  'timeSignatures',
  'syncAnchors',
  'tracks',
);
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  encoder.encode(v).length <= 128 &&
  !control.test(v);
const title = (v: unknown): v is string =>
  typeof v === 'string' &&
  visible.test(v) &&
  [...v].length <= 200 &&
  !control.test(v);
// Rust project_model과 같은 규칙: 한 개 이상·중복 없음·정해진 순서, 벤딩 양은 BEND일 때만(docs/12 주법 편집 v1).
function techniques(list: unknown, bend: unknown): boolean {
  if (list === undefined) return bend === undefined;
  if (!Array.isArray(list) || list.length === 0) return false;
  const indexes = list.map((t) => techniqueOrder.indexOf(t as never));
  if (indexes.some((i, n) => i < 0 || (n > 0 && i <= indexes[n - 1]!)))
    return false;
  // 이음(해머온·슬라이드)은 한 음에 하나만 둡니다(docs/12 주법 편집 v2).
  if (list.filter((t) => linkTechniques.includes(t)).length > 1) return false;
  return list.includes('BEND') ? bend === 1 || bend === 2 : bend === undefined;
}
function note(v: unknown): v is NoteEvent {
  return (
    isRecord(v) &&
    noteFields(v) &&
    id(v.id) &&
    id(v.trackId) &&
    isSafeUnsigned(v.measureIndex, 100000) &&
    isSafeUnsigned(v.startTick) &&
    isSafeUnsigned(v.durationTicks) &&
    v.durationTicks > 0 &&
    v.durationTicks <= Number.MAX_SAFE_INTEGER - v.startTick &&
    (v.playbackTick === undefined ||
      (isSafeUnsigned(v.playbackTick) &&
        v.playbackTick > v.startTick &&
        v.playbackTick < v.startTick + v.durationTicks)) &&
    isSafeUnsigned(v.pitchMidi, 127) &&
    (v.stringIndex === undefined ||
      (isSafeUnsigned(v.stringIndex, 12) && v.stringIndex > 0)) &&
    (v.fret === undefined || isSafeUnsigned(v.fret, 36)) &&
    (v.notationNoteId === undefined || id(v.notationNoteId)) &&
    (v.attack === undefined || typeof v.attack === 'boolean') &&
    (v.judgementSupport === undefined ||
      v.judgementSupport === 'UNSUPPORTED') &&
    techniques(v.techniques, v.bendSemitones) &&
    (v.source === 'manual' || v.source === 'import' || v.source === 'ai')
  );
}
function track(v: unknown): v is ScoreTrack {
  if (
    !isRecord(v) ||
    !trackFields(v) ||
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
  return (
    v.notes.every(
      (n) =>
        n.trackId === v.id &&
        (n.stringIndex === undefined || n.stringIndex <= count),
    ) &&
    // 이음 시작 음에는 도착 음(같은 줄의 다음 음)이 있어야 합니다.
    [...linkTargets(v.notes).values()].every((target) => target !== undefined)
  );
}
function anchor(v: unknown): v is SyncAnchor {
  return (
    isRecord(v) &&
    only('scoreTick', 'audioTimeMs')(v) &&
    isSafeUnsigned(v.scoreTick) &&
    isNumberWithin(v.audioTimeMs, 0, 86400000)
  );
}
function tempo(v: unknown): v is ScoreDocument['tempoMap'][number] {
  return (
    isRecord(v) &&
    only('tick', 'bpm')(v) &&
    isSafeUnsigned(v.tick) &&
    isNumberWithin(v.bpm, 10, 600)
  );
}
function signature(v: unknown): v is ScoreDocument['timeSignatures'][number] {
  return (
    isRecord(v) &&
    only('tick', 'numerator', 'denominator')(v) &&
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
    scoreFields(v) &&
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
