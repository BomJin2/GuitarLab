import type { ScoreDocument } from '../../entities/score';
import { scoreTickToAudioTime } from '../player/sync';
import { validateEditable } from './normalizedNotation';

export type StructureEdit =
  | { kind: 'ADD_GUITAR_TRACK' }
  | { kind: 'REMOVE_TRACK'; trackId: string; discardNotes: true }
  | { kind: 'SET_TRACK_NAME'; trackId: string; name: string }
  | { kind: 'SET_TUNING'; trackId: string; tuningMidi: number[] }
  | { kind: 'SET_TEMPO'; measureIndex: number; bpm: number; resetSync: true }
  | {
      kind: 'SET_SIGNATURE';
      measureIndex: number;
      numerator: number;
      denominator: number;
      resetSync: true;
    }
  | { kind: 'INSERT_MEASURE'; measureIndex: number; resetSync: true }
  | {
      kind: 'REMOVE_MEASURE';
      measureIndex: number;
      discardNotes: true;
      resetSync: true;
    };
type LayoutBar = {
  sourceIndex: number | null;
  numerator: number;
  denominator: number;
  bpm: number;
};
const comparableName = (name: string) => name.trim().replace(/\u00a0/g, ' ');

export function editStructure(
  document: ScoreDocument,
  edit: StructureEdit,
): ScoreDocument {
  const bars = validateEditable(document);
  if (edit.kind === 'REMOVE_TRACK') {
    if (
      edit.discardNotes !== true ||
      document.tracks.length <= 1 ||
      !document.tracks.some((track) => track.id === edit.trackId)
    )
      throw new Error(
        '삭제할 트랙과 음표 제거 확인을 확인하세요. 마지막 트랙은 유지해야 합니다.',
      );
    const next: ScoreDocument = {
      ...document,
      renderSource: 'NORMALIZED',
      tracks: document.tracks.filter((track) => track.id !== edit.trackId),
    };
    validateEditable(next);
    return next;
  }
  if (edit.kind === 'SET_TRACK_NAME') {
    const name = edit.name.trim();
    if (
      !name ||
      [...name].length > 200 ||
      /\p{Cc}/u.test(edit.name) ||
      !document.tracks.some((track) => track.id === edit.trackId)
    )
      throw new Error(
        '선택 트랙과 이름을 확인하세요. 이름은 제어 문자 없는1~200자입니다.',
      );
    if (
      document.tracks.some(
        (track) =>
          track.id !== edit.trackId &&
          comparableName(track.name) === comparableName(name),
      )
    )
      throw new Error('다른 트랙과 겹치지 않는 이름을 입력하세요.');
    return {
      ...document,
      renderSource: 'NORMALIZED',
      tracks: document.tracks.map((track) =>
        track.id === edit.trackId ? { ...track, name } : track,
      ),
    };
  }
  if (edit.kind === 'ADD_GUITAR_TRACK') {
    if (document.tracks.length >= 128)
      throw new Error('악보 트랙은 최대128개까지 추가할 수 있습니다.');
    let number = 1;
    while (
      document.tracks.some(
        (track) => comparableName(track.name) === `기타 ${number}`,
      )
    )
      number++;
    const next: ScoreDocument = {
      ...document,
      renderSource: 'NORMALIZED',
      tracks: [
        ...document.tracks,
        {
          id: crypto.randomUUID(),
          name: `기타 ${number}`,
          tuningMidi: [64, 59, 55, 50, 45, 40],
          instrument: 'GUITAR',
          role: 'UNKNOWN',
          notes: [],
        },
      ],
    };
    validateEditable(next);
    return next;
  }
  if (edit.kind === 'SET_TUNING') {
    if (
      !document.tracks.some((t) => t.id === edit.trackId) ||
      edit.tuningMidi.length !== 6 ||
      edit.tuningMidi.some((p) => !Number.isInteger(p) || p < 0 || p > 127)
    )
      throw new Error(
        '선택 트랙과1번 줄부터의 MIDI 튜닝6개(0~127 정수)를 확인하세요.',
      );
    const next: ScoreDocument = {
      ...document,
      renderSource: 'NORMALIZED',
      tracks: document.tracks.map((track) =>
        track.id !== edit.trackId
          ? track
          : {
              ...track,
              tuningMidi: [...edit.tuningMidi],
              notes: track.notes.map((n) => ({
                ...n,
                pitchMidi:
                  (edit.tuningMidi[(n.stringIndex ?? 0) - 1] ?? -100) +
                  (n.fret ?? 0),
                source: 'manual',
              })),
            },
      ),
    };
    validateEditable(next);
    return next;
  }
  if (
    edit.resetSync !== true ||
    !Number.isInteger(edit.measureIndex) ||
    edit.measureIndex < 0 ||
    edit.measureIndex > bars.length ||
    (edit.kind !== 'INSERT_MEASURE' && edit.measureIndex === bars.length)
  )
    throw new Error('마디 번호와 수동 싱크 재설정 확인을 확인하세요.');
  const tempoAt = (tick: number) =>
    [...document.tempoMap].reverse().find((t) => t.tick <= tick)?.bpm ?? 120;
  const layout: LayoutBar[] = bars.map((bar, sourceIndex) => ({
    sourceIndex,
    numerator: bar.numerator,
    denominator: bar.denominator,
    bpm: tempoAt(bar.start),
  }));
  if (edit.kind === 'INSERT_MEASURE') {
    const reference = layout[edit.measureIndex] ?? layout.at(-1);
    if (!reference || layout.length >= 256)
      throw new Error('마디는1~256개 범위에서 편집하세요.');
    layout.splice(edit.measureIndex, 0, { ...reference, sourceIndex: null });
  } else if (edit.kind === 'REMOVE_MEASURE') {
    if (layout.length <= 1 || edit.discardNotes !== true)
      throw new Error(
        '마지막 마디는 삭제할 수 없으며 해당 마디 음표 삭제를 명시해야 합니다.',
      );
    layout.splice(edit.measureIndex, 1);
  } else if (edit.kind === 'SET_SIGNATURE') {
    const bar = layout[edit.measureIndex];
    if (
      !bar ||
      !Number.isInteger(edit.numerator) ||
      edit.numerator < 1 ||
      edit.numerator > 32 ||
      ![1, 2, 4, 8, 16, 32].includes(edit.denominator)
    )
      throw new Error('박자의 분자는1~32, 분모는1/2/4/8/16/32로 입력하세요.');
    layout[edit.measureIndex] = {
      ...bar,
      numerator: edit.numerator,
      denominator: edit.denominator,
    };
  } else {
    if (!Number.isFinite(edit.bpm) || edit.bpm < 10 || edit.bpm > 600)
      throw new Error('템포는10~600 BPM으로 입력하세요.');
    const start = bars[edit.measureIndex]?.start;
    if (start === undefined) throw new Error('마디를 찾을 수 없습니다.');
    const stop =
      document.tempoMap.find((t) => t.tick > start)?.tick ?? Infinity;
    layout.forEach((bar, index) => {
      const source = bars[index];
      if (source && source.start >= start && source.start < stop)
        bar.bpm = edit.bpm;
    });
  }
  let endTick = 0;
  const positions = layout.map((bar) => {
    const start = endTick;
    endTick += (document.ppq * 4 * bar.numerator) / bar.denominator;
    return { ...bar, start, end: endTick };
  });
  const tracks = document.tracks.map((track) => ({
    ...track,
    notes: track.notes.flatMap((note) => {
      const sourceIndex = bars.findIndex(
        (b) => b.start <= note.startTick && note.startTick < b.end,
      );
      const measureIndex = positions.findIndex(
        (b) => b.sourceIndex === sourceIndex,
      );
      const destination = positions[measureIndex];
      const source = bars[sourceIndex];
      if (!destination || !source) return [];
      const startTick = destination.start + note.startTick - source.start;
      if (startTick + note.durationTicks > destination.end)
        throw new Error(
          '줄어든 마디에 음표가 넘칩니다. 음표 길이나 위치를 먼저 조절하세요.',
        );
      return [{ ...note, startTick, measureIndex }];
    }),
  }));
  const tempoMap = positions
    .filter(
      (bar, index) => index === 0 || bar.bpm !== positions[index - 1]?.bpm,
    )
    .map((bar) => ({ tick: bar.start, bpm: bar.bpm }));
  const origin = scoreTickToAudioTime(document.syncAnchors, 0);
  if (!Number.isFinite(origin) || origin < 0)
    throw new Error(
      '0tick의 음원 시각이 음수입니다. 수동 싱크를 먼저 확인하세요.',
    );
  let audioTimeMs = origin;
  let previousTick = 0;
  let previousBpm = tempoMap[0]?.bpm ?? 120;
  const syncAnchors = tempoMap.map((point) => {
    audioTimeMs +=
      ((point.tick - previousTick) * 60000) / (document.ppq * previousBpm);
    previousTick = point.tick;
    previousBpm = point.bpm;
    return { scoreTick: point.tick, audioTimeMs };
  });
  syncAnchors.push({
    scoreTick: endTick,
    audioTimeMs:
      audioTimeMs +
      ((endTick - previousTick) * 60000) / (document.ppq * previousBpm),
  });
  const next: ScoreDocument = {
    ...document,
    renderSource: 'NORMALIZED',
    tracks,
    tempoMap,
    syncAnchors,
    timeSignatures: positions.map((bar) => ({
      tick: bar.start,
      numerator: bar.numerator,
      denominator: bar.denominator,
    })),
  };
  validateEditable(next);
  return next;
}
