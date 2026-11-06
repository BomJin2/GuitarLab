/** docs/12 "주법 편집 v1": 이 순서로 정렬합니다. */
export const techniqueOrder = [
  'PALM_MUTE',
  'DEAD',
  'GHOST',
  'STACCATO',
  'VIBRATO',
  'BEND',
  'TAP',
  // 주법 편집 v2
  'HAMMER',
  'SLIDE_LEGATO',
  'SLIDE_SHIFT',
  'HARMONIC_NATURAL',
  'LET_RING',
] as const;
export type Technique = (typeof techniqueOrder)[number];
/** 음정이 그대로라 일반 음처럼 채점하는 주법(사용자 결정, docs/12 주법 편집 v1·v2) */
export const pitchScoredTechniques: readonly Technique[] = [
  'PALM_MUTE',
  'STACCATO',
  'HAMMER',
  'SLIDE_LEGATO',
  'SLIDE_SHIFT',
  'LET_RING',
];
/** 다음 같은 줄 음으로 이어지는 주법(시작 음에만 둠, 한 음에 하나) */
export const linkTechniques: readonly Technique[] = [
  'HAMMER',
  'SLIDE_LEGATO',
  'SLIDE_SHIFT',
];
/** 도착 음을 다시 치지 않는 이음(도착 음은 채점 제외) */
const unpickedLinks: readonly Technique[] = ['HAMMER', 'SLIDE_LEGATO'];
type LinkNote = Pick<
  NoteEvent,
  'id' | 'startTick' | 'stringIndex' | 'techniques'
>;
/** 음 ID를 유니코드 코드 포인트 순서(= UTF-8 바이트 순서, Rust String 비교)로 비교합니다(docs/12 같은 시각 목표의 순서). */
export function compareIds(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    // 첫 차이에서 UTF-16 단위를 코드 포인트 순서로 옮깁니다: 서로게이트(D800~DFFF)는 E000~FFFF보다 뒤입니다.
    if (x !== y) return unitOrder(x) - unitOrder(y);
  }
  return a.length - b.length;
}
const unitOrder = (unit: number) =>
  unit >= 0xe000 ? unit - 0x800 : unit >= 0xd800 ? unit + 0x2000 : unit;
/**
 * 이음 시작 음 ID → 도착 음. 도착 음은 같은 트랙에서 시작 tick이 더 큰 같은 줄의 첫 음이며, 없으면 undefined입니다.
 * Rust project_model::link_targets와 같은 규칙입니다(docs/12 주법 편집 v2).
 */
export function linkTargets<T extends LinkNote>(
  notes: readonly T[],
): Map<string, T | undefined> {
  const sorted = [...notes].sort(
    (a, b) => a.startTick - b.startTick || compareIds(a.id, b.id),
  );
  const result = new Map<string, T | undefined>();
  const next = new Map<number, T>();
  // 뒤에서부터 같은 tick 묶음 단위로 보며 "더 큰 tick의 가장 가까운 같은 줄 음"을 기억합니다.
  for (let end = sorted.length; end > 0; ) {
    const tick = sorted[end - 1]!.startTick;
    let start = end - 1;
    while (start > 0 && sorted[start - 1]!.startTick === tick) start--;
    const group = sorted.slice(start, end);
    for (const note of group)
      if (note.techniques?.some((t) => linkTechniques.includes(t)))
        result.set(
          note.id,
          note.stringIndex === undefined
            ? undefined
            : next.get(note.stringIndex),
        );
    // 같은 tick·같은 줄 후보가 여럿이면 정렬상 첫 음(작은 ID)이 남도록 역순으로 갱신합니다.
    for (const note of [...group].reverse())
      if (note.stringIndex !== undefined) next.set(note.stringIndex, note);
    end = start;
  }
  return result;
}
/** 피킹 없이 이어지는 도착 음(해머온·이어 치기 슬라이드)의 ID */
export function unpickedDestinations(notes: readonly LinkNote[]): Set<string> {
  const ids = new Set<string>();
  const origins = new Map(notes.map((n) => [n.id, n]));
  for (const [origin, target] of linkTargets(notes))
    if (
      target &&
      origins.get(origin)?.techniques?.some((t) => unpickedLinks.includes(t))
    )
      ids.add(target.id);
  return ids;
}
/** 채점에서 빼는 음. Rust prepare_archive와 같은 규칙입니다. */
export function excludedFromScoring(
  note: {
    judgementSupport?: 'UNSUPPORTED';
    techniques?: readonly Technique[];
  },
  unpickedDestination = false,
): boolean {
  return (
    unpickedDestination ||
    note.judgementSupport === 'UNSUPPORTED' ||
    (note.techniques ?? []).some((t) => !pitchScoredTechniques.includes(t))
  );
}
export type NoteEvent = {
  id: string;
  trackId: string;
  measureIndex: number;
  startTick: number;
  durationTicks: number;
  /** docs/12 "playbackTick v1": 악보 위치와 다른 실제 소리 시각(스윙 뒤 음). 같으면 없음 */
  playbackTick?: number;
  pitchMidi: number;
  stringIndex?: number;
  fret?: number;
  notationNoteId?: string;
  attack?: boolean;
  judgementSupport?: 'UNSUPPORTED';
  techniques?: Technique[];
  /** BEND일 때만: 반음 1, 온음 2 */
  bendSemitones?: 1 | 2;
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
