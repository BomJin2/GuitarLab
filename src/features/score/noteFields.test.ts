import { expect, it } from 'vitest';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import type { ScoreDocument, Technique } from '../../entities/score';
import { renderNormalized, renderOriginalScore } from './normalizedNotation';
import { normalizeScore } from './alphaTabAdapter';
import { editNote } from './scoreEditing';
import { editStructure } from './scoreStructure';
import { decodeScoreJson } from './scoreJson';

// docs/12 "playbackTick v1": 음표 하나에 소리 시각을 붙인 문서
function withPlayback(index: number): {
  document: ScoreDocument;
  tick: number;
} {
  const document = structuredClone(scoreEditingFixture().document);
  const note = document.tracks[0]?.notes[index];
  if (!note || note.durationTicks < 3) throw new Error('테스트 음표 필요');
  const tick = note.startTick + Math.floor(note.durationTicks / 3);
  note.playbackTick = tick;
  return { document, tick };
}

it('소리 시각은 자기 음표 길이 안(시작 초과·끝 미만)만 허용한다', () => {
  const { document } = withPlayback(1);
  expect(() => decodeScoreDocument(document)).not.toThrow();
  const note = document.tracks[0]!.notes[1]!;
  for (const bad of [
    note.startTick,
    note.startTick + note.durationTicks,
    -1,
    1.5,
  ]) {
    const broken = structuredClone(document);
    broken.tracks[0]!.notes[1]!.playbackTick = bad;
    expect(() => decodeScoreDocument(broken), `값 ${bad}`).toThrow();
  }
});

it('줄·프렛만 고치면 소리 시각을 유지하고, 위치·길이를 바꾸면 지운다', () => {
  const { document, tick } = withPlayback(1);
  const track = document.tracks[0]!;
  const note = track.notes[1]!;
  const fretOnly = editNote(document, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: {
      startTick: note.startTick,
      durationTicks: note.durationTicks,
      stringIndex: 2,
      fret: 5,
    },
  });
  expect(fretOnly.tracks[0]?.notes.find((n) => n.id === note.id)).toMatchObject(
    { fret: 5, playbackTick: tick },
  );
  const moved = editNote(document, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: {
      startTick: note.startTick,
      durationTicks: note.durationTicks / 2,
      stringIndex: note.stringIndex ?? 1,
      fret: note.fret ?? 0,
    },
  });
  expect(
    moved.tracks[0]?.notes.find((n) => n.id === note.id)?.playbackTick,
  ).toBeUndefined();
});

it('마디 삽입으로 음표가 옮겨지면 소리 시각도 같은 만큼 옮기고 JSON 왕복을 허용한다', () => {
  const { document, tick } = withPlayback(4);
  const note = document.tracks[0]!.notes[4]!;
  const inserted = editStructure(document, {
    kind: 'INSERT_MEASURE',
    measureIndex: 1,
    resetSync: true,
  });
  const shifted = inserted.tracks[0]?.notes.find((n) => n.id === note.id);
  const shift = (shifted?.startTick ?? 0) - note.startTick;
  expect(shift).toBeGreaterThan(0);
  expect(shifted?.playbackTick).toBe(tick + shift);
  const bytes = new TextEncoder().encode(JSON.stringify(inserted));
  expect(
    decodeScoreJson(bytes).tracks[0]?.notes.find((n) => n.id === note.id)
      ?.playbackTick,
  ).toBe(tick + shift);
});

it('주법 편집 v1: 7가지 주법(조합 포함)이 편집본 그리기 왕복에서 그대로 남는다', () => {
  const document = structuredClone(scoreEditingFixture().document);
  const notes = document.tracks[0]!.notes;
  const sets: [Technique[], (1 | 2)?][] = [
    [['PALM_MUTE', 'STACCATO']],
    [['DEAD', 'GHOST']],
    [['VIBRATO']],
    [['BEND'], 1],
    [['TAP']],
    [['BEND', 'TAP'], 2],
  ];
  sets.forEach(([techniques, bend], i) => {
    notes[i]!.techniques = techniques;
    if (bend) notes[i]!.bendSemitones = bend;
  });
  const { score, playbackLookup } = renderNormalized({
    ...document,
    renderSource: 'NORMALIZED',
  });
  const back = normalizeScore(score, playbackLookup).tracks[0]!.notes;
  expect(back.slice(0, 6).map((n) => [n.techniques, n.bendSemitones])).toEqual(
    sets.map(([t, b]) => [t, b]),
  );
  expect(back.slice(6).some((n) => n.techniques)).toBe(false);
});

it('주법 편집 v1: 음 수정·추가에서 주법을 바꾸고 빈 목록은 지우며 벤딩 양은 BEND일 때만 둔다', () => {
  const document = structuredClone(scoreEditingFixture().document);
  const track = document.tracks[0]!;
  const note = track.notes[0]!;
  const draft = {
    startTick: note.startTick,
    durationTicks: note.durationTicks,
    stringIndex: note.stringIndex!,
    fret: note.fret!,
  };
  const marked = editNote(document, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: { ...draft, techniques: ['TAP', 'BEND'], bendSemitones: 1 },
  });
  const edited = marked.tracks[0]!.notes.find((n) => n.id === note.id)!;
  expect([edited.techniques, edited.bendSemitones]).toEqual([
    ['BEND', 'TAP'],
    1,
  ]);
  // 주법 칸을 주지 않으면 기존 값을 둡니다.
  const fretOnly = editNote(marked, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: { ...draft, fret: 5 },
  });
  expect(
    fretOnly.tracks[0]!.notes.find((n) => n.id === note.id)!.techniques,
  ).toEqual(['BEND', 'TAP']);
  const cleared = editNote(marked, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: { ...draft, techniques: [], bendSemitones: 2 },
  }).tracks[0]!.notes.find((n) => n.id === note.id)!;
  expect([cleared.techniques, cleared.bendSemitones]).toEqual([
    undefined,
    undefined,
  ]);
  expect(() =>
    editNote(document, {
      kind: 'UPDATE',
      trackId: track.id,
      noteId: note.id,
      value: { ...draft, techniques: ['BEND'] },
    }),
  ).toThrow('반음 또는 온음');
});

it('주법 편집 v1: 주법이 든 JSON 악보를 다시 열어도 주법과 벤딩 양이 그대로 그려진다', () => {
  const document = structuredClone(scoreEditingFixture().document);
  document.tracks[0]!.notes[0]!.techniques = ['PALM_MUTE', 'BEND'];
  document.tracks[0]!.notes[0]!.bendSemitones = 1;
  document.tracks[0]!.notes[1]!.techniques = ['DEAD', 'GHOST'];
  const bytes = new TextEncoder().encode(
    JSON.stringify({ ...document, renderSource: 'NORMALIZED' }),
  );
  const { score, playbackLookup } = renderOriginalScore(bytes);
  const notes = normalizeScore(score, playbackLookup).tracks[0]!.notes;
  expect(notes.slice(0, 2).map((n) => [n.techniques, n.bendSemitones])).toEqual(
    [
      [['PALM_MUTE', 'BEND'], 1],
      [['DEAD', 'GHOST'], undefined],
    ],
  );
});
