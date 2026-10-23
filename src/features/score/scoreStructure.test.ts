import { expect, it, vi } from 'vitest';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { editStructure } from './scoreStructure';
import { editNote } from './scoreEditing';
import { renderNormalized, toNormalizedMusicXml } from './normalizedNotation';
import { decodeScoreJson } from './scoreJson';
import { importScore } from './alphaTabAdapter';
import { timingAt } from '../player/timing';

it('선택한 트랙/음표만 제거하고 마지막/없는 트랙을 거부하며 원본·싱크와 남은 ID를 보존한다', () => {
  const original = scoreEditingFixture().document;
  const added = editStructure(original, { kind: 'ADD_GUITAR_TRACK' });
  const before = JSON.stringify(added);
  expect(() =>
    editStructure(added, {
      kind: 'REMOVE_TRACK',
      trackId: added.tracks[0]!.id,
      // @ts-expect-error 잘못된 런타임 요청은 명시적 확인 없이 삭제하지 않습니다.
      discardNotes: false,
    }),
  ).toThrow('확인');
  const removed = editStructure(added, {
    kind: 'REMOVE_TRACK',
    trackId: added.tracks[0]!.id,
    discardNotes: true,
  });
  expect(removed.tracks).toEqual([added.tracks[1]]);
  expect(removed.tracks[0]).toBe(added.tracks[1]);
  expect(removed.syncAnchors).toBe(added.syncAnchors);
  expect(removed.tempoMap).toBe(added.tempoMap);
  expect(removed.timeSignatures).toBe(added.timeSignatures);
  expect(JSON.stringify(added)).toBe(before);
  expect(
    decodeScoreJson(new TextEncoder().encode(JSON.stringify(removed))),
  ).toEqual(removed);
  expect(renderNormalized(removed).score.tracks).toHaveLength(1);
  expect(() =>
    editStructure(added, {
      kind: 'REMOVE_TRACK',
      trackId: '없는 트랙',
      discardNotes: true,
    }),
  ).toThrow('트랙');
  expect(() =>
    editStructure(removed, {
      kind: 'REMOVE_TRACK',
      trackId: removed.tracks[0]!.id,
      discardNotes: true,
    }),
  ).toThrow('마지막');
});

it('빈 기타 트랙을 추가해 기존 트랙·시간·싱크를 보존하고 JSON과 실제 MusicXML 렌더를 왕복한다', () => {
  const document = scoreEditingFixture().document;
  document.tracks[0]!.name = '기타 1';
  document.syncAnchors = document.syncAnchors.map((a) => ({
    ...a,
    audioTimeMs: a.audioTimeMs + 500,
  }));
  const original = JSON.stringify(document);
  const edited = editStructure(document, { kind: 'ADD_GUITAR_TRACK' });
  expect(edited.tracks[0]).toBe(document.tracks[0]);
  expect(edited.tracks[1]).toEqual({
    id: expect.any(String),
    name: '기타 2',
    notes: [],
    tuningMidi: [64, 59, 55, 50, 45, 40],
    instrument: 'GUITAR',
    role: 'UNKNOWN',
  });
  expect(edited.tracks[1]?.id).not.toBe(document.tracks[0]?.id);
  expect(edited.syncAnchors).toBe(document.syncAnchors);
  expect(edited.tempoMap).toBe(document.tempoMap);
  expect(edited.timeSignatures).toBe(document.timeSignatures);
  expect(JSON.stringify(document)).toBe(original);
  expect(
    decodeScoreJson(new TextEncoder().encode(JSON.stringify(edited))),
  ).toEqual(edited);
  expect(renderNormalized(edited).score.tracks).toHaveLength(2);
  const imported = importScore(
    new TextEncoder().encode(toNormalizedMusicXml(edited)),
  );
  // alphaTab은 표시용 이름의 공백을 줄바꿈 방지 공백으로 바꿉니다.
  expect(
    imported.tracks.map((track) => track.name.replace(/\u00a0/g, ' ')),
  ).toEqual(['기타 1', '기타 2']);
  expect(imported.tracks[1]?.staves[0]?.tuning).toEqual([
    64, 59, 55, 50, 45, 40,
  ]);
  const displayedName = {
    ...document,
    tracks: document.tracks.map((track) => ({
      ...track,
      name: '기타\u00a01',
    })),
  };
  expect(
    editStructure(displayedName, { kind: 'ADD_GUITAR_TRACK' }).tracks[1]?.name,
  ).toBe('기타 2');
});

it('128번째 기타 트랙까지만 허용하고 미지원 문서나 ID 충돌은 원본을 유지해 거부한다', () => {
  const document = scoreEditingFixture().document;
  const track = document.tracks[0]!;
  const many = {
    ...document,
    tracks: Array.from({ length: 127 }, (_, i) => ({
      ...track,
      id: `track-${i}`,
      name: `기타 ${i + 1}`,
      notes: [],
    })),
  };
  const full = editStructure(many, { kind: 'ADD_GUITAR_TRACK' });
  expect(full.tracks).toHaveLength(128);
  expect(full.tracks[127]?.name).toBe('기타 128');
  expect(() => editStructure(full, { kind: 'ADD_GUITAR_TRACK' })).toThrow(
    '128',
  );
  expect(many.tracks).toHaveLength(127);
  const unsupported = {
    ...document,
    tracks: [
      {
        ...track,
        notes: track.notes.map((note) => ({
          ...note,
          judgementSupport: 'UNSUPPORTED' as const,
        })),
      },
    ],
  };
  expect(() =>
    editStructure(unsupported, { kind: 'ADD_GUITAR_TRACK' }),
  ).toThrow('미지원');
  const collision = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000001');
  try {
    const duplicate = {
      ...document,
      tracks: [
        { ...track, id: '00000000-0000-4000-8000-000000000001', notes: [] },
      ],
    };
    expect(() =>
      editStructure(duplicate, { kind: 'ADD_GUITAR_TRACK' }),
    ).toThrow();
    expect(duplicate.tracks).toHaveLength(1);
  } finally {
    collision.mockRestore();
  }
});

it('이름만 바꾸고 다른 트랙·음표·싱크를 보존하며 XML 특수문자/JSON을 왕복한다', () => {
  const document = editStructure(scoreEditingFixture().document, {
    kind: 'ADD_GUITAR_TRACK',
  });
  const track = document.tracks[1]!;
  const original = JSON.stringify(document);
  const renamed = editStructure(document, {
    kind: 'SET_TRACK_NAME',
    trackId: track.id,
    name: '  리드 & <기타>  ',
  });
  expect(renamed.tracks[1]).toEqual({ ...track, name: '리드 & <기타>' });
  expect(renamed.tracks[1]?.notes).toBe(track.notes);
  expect(renamed.tracks[0]).toBe(document.tracks[0]);
  expect(renamed.syncAnchors).toBe(document.syncAnchors);
  expect(renamed.tempoMap).toBe(document.tempoMap);
  expect(renamed.timeSignatures).toBe(document.timeSignatures);
  expect(JSON.stringify(document)).toBe(original);
  expect(toNormalizedMusicXml(renamed)).toContain(
    '<part-name>리드 &amp; &lt;기타&gt;</part-name>',
  );
  expect(
    renderNormalized(renamed).score.tracks[1]?.name.replace(/\u00a0/g, ' '),
  ).toBe('리드 & <기타>');
  expect(
    decodeScoreJson(new TextEncoder().encode(JSON.stringify(renamed))),
  ).toEqual(renamed);
});

it('이름은 Unicode200자까지 허용하고 빈값·초과·제어문자·중복·없는 트랙을 거부한다', () => {
  const document = editStructure(scoreEditingFixture().document, {
    kind: 'ADD_GUITAR_TRACK',
  });
  const track = document.tracks[1]!;
  const original = JSON.stringify(document);
  const rename = (name: string, trackId = track.id) =>
    editStructure(document, {
      kind: 'SET_TRACK_NAME',
      trackId,
      name,
    });
  expect(rename('🎸'.repeat(200)).tracks[1]?.name).toBe('🎸'.repeat(200));
  for (const name of [
    '',
    '  ',
    '🎸'.repeat(201),
    '리드\u0000',
    '\n리드',
    '리드\u0085',
  ])
    expect(() => rename(name)).toThrow('1~200');
  expect(() => rename('정상', '없는 ID')).toThrow('선택 트랙');
  const named = {
    ...document,
    tracks: document.tracks.map((t, i) =>
      i === 0 ? { ...t, name: '리드\u00a0기타' } : t,
    ),
  };
  expect(() =>
    editStructure(named, {
      kind: 'SET_TRACK_NAME',
      trackId: track.id,
      name: '리드 기타',
    }),
  ).toThrow('겹치지');
  expect(JSON.stringify(document)).toBe(original);
});

it('마디 템포는 다음 변화 전까지 적용하고 인트로를 보존한 싱크와 실제 렌더를 만든다', () => {
  const document = scoreEditingFixture().document;
  document.syncAnchors = document.syncAnchors.map((a) => ({
    ...a,
    audioTimeMs: a.audioTimeMs + 500,
  }));
  const original = JSON.stringify(document);
  const edited = editStructure(document, {
    kind: 'SET_TEMPO',
    measureIndex: 1,
    bpm: 60,
    resetSync: true,
  });
  expect(edited.tempoMap).toEqual([
    { tick: 0, bpm: 120 },
    { tick: 3840, bpm: 60 },
  ]);
  expect(edited.syncAnchors).toEqual([
    { scoreTick: 0, audioTimeMs: 500 },
    { scoreTick: 3840, audioTimeMs: 2500 },
    { scoreTick: 7680, audioTimeMs: 6500 },
  ]);
  expect(timingAt(edited, 3000).bpm).toBe(60);
  renderNormalized(edited);
  expect(JSON.stringify(document)).toBe(original);
});
it('박자 축소는 음표 넘침을 거부하고 여유가 있으면 다음 마디를 정확히 이동한다', () => {
  const document = scoreEditingFixture().document;
  const track = document.tracks[0];
  const last = track?.notes[3];
  if (!track || !last) throw new Error('테스트 마디 필요');
  expect(() =>
    editStructure(document, {
      kind: 'SET_SIGNATURE',
      measureIndex: 0,
      numerator: 3,
      denominator: 4,
      resetSync: true,
    }),
  ).toThrow('넘칩니다');
  const prepared = editNote(document, {
    kind: 'DELETE',
    trackId: track.id,
    noteId: last.id,
  });
  const edited = editStructure(prepared, {
    kind: 'SET_SIGNATURE',
    measureIndex: 0,
    numerator: 3,
    denominator: 4,
    resetSync: true,
  });
  expect(edited.timeSignatures).toEqual([
    { tick: 0, numerator: 3, denominator: 4 },
    { tick: 2880, numerator: 4, denominator: 4 },
  ]);
  expect(edited.tracks[0]?.notes[3]).toMatchObject({
    id: track.notes[4]?.id,
    startTick: 2880,
    measureIndex: 1,
  });
  renderNormalized(edited);
});
it('빈 마디 삽입/삭제는 다른 음표 ID를 보존하고 선택 마디의 음표만 제거한다', () => {
  const document = scoreEditingFixture().document;
  const inserted = editStructure(document, {
    kind: 'INSERT_MEASURE',
    measureIndex: 1,
    resetSync: true,
  });
  expect(inserted.timeSignatures.map((s) => s.tick)).toEqual([0, 3840, 7680]);
  expect(inserted.tracks[0]?.notes[4]).toMatchObject({
    id: document.tracks[0]?.notes[4]?.id,
    startTick: 7680,
    measureIndex: 2,
  });
  renderNormalized(inserted);
  const removed = editStructure(inserted, {
    kind: 'REMOVE_MEASURE',
    measureIndex: 1,
    discardNotes: true,
    resetSync: true,
  });
  expect(removed.tracks).toEqual(document.tracks);
  const one = editStructure(document, {
    kind: 'REMOVE_MEASURE',
    measureIndex: 0,
    discardNotes: true,
    resetSync: true,
  });
  expect(one.tracks[0]?.notes).toHaveLength(4);
  expect(one.tracks[0]?.notes[0]).toMatchObject({
    id: document.tracks[0]?.notes[4]?.id,
    startTick: 0,
    measureIndex: 0,
  });
  renderNormalized(one);
  expect(() =>
    editStructure(one, {
      kind: 'REMOVE_MEASURE',
      measureIndex: 0,
      discardNotes: true,
      resetSync: true,
    }),
  ).toThrow('마지막');
});
it('튜닝은 프렛/시간/싱크를 보존해 음정만 계산하고 범위·템포·마디 오류는 원본을 보존한다', () => {
  const document = scoreEditingFixture().document;
  const track = document.tracks[0];
  if (!track) throw new Error('테스트 트랙 필요');
  const original = JSON.stringify(document);
  const tuned = editStructure(document, {
    kind: 'SET_TUNING',
    trackId: track.id,
    tuningMidi: [62, 59, 55, 50, 45, 40],
  });
  expect(tuned.tracks[0]?.notes[0]).toMatchObject({
    id: track.notes[0]?.id,
    pitchMidi: 62,
    fret: 0,
    startTick: 0,
  });
  expect(tuned.syncAnchors).toBe(document.syncAnchors);
  renderNormalized(tuned);
  for (const bpm of [NaN, 0, 601])
    expect(() =>
      editStructure(document, {
        kind: 'SET_TEMPO',
        measureIndex: 0,
        bpm,
        resetSync: true,
      }),
    ).toThrow();
  expect(() =>
    editStructure(document, {
      kind: 'SET_TEMPO',
      measureIndex: -1,
      bpm: 120,
      resetSync: true,
    }),
  ).toThrow();
  expect(() =>
    editStructure(document, {
      kind: 'SET_TUNING',
      trackId: track.id,
      tuningMidi: [127, 59, 55, 50, 45, 40],
    }),
  ).toThrow();
  expect(JSON.stringify(document)).toBe(original);
});
