import { expect, it } from 'vitest';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import {
  editNote,
  commitEdit,
  redoEdit,
  undoEdit,
  type EditHistory,
} from './scoreEditing';
import {
  renderNormalized,
  renderStoredScore,
  toNormalizedMusicXml,
  validateEditable,
} from './normalizedNotation';
import { normalizeScore } from './alphaTabAdapter';
import { buildPracticeTargets } from '../practice/practice';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import { importer, model } from '@coderline/alphatab';

it('줄·프렛·길이 수정 후 실제 alphaTab 왕복과 판정 목표가 일치하며 원본/ID/앵커를 보존한다', () => {
  const session = scoreEditingFixture();
  const original = JSON.stringify(session.document);
  const originalBytes = session.originalBytes.slice();
  const track = session.document.tracks[0];
  const note = track?.notes[0];
  if (!track || !note) throw new Error('테스트 음표 필요');
  const document = editNote(session.document, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: { startTick: 0, durationTicks: 240, stringIndex: 2, fret: 5 },
  });
  const edited = document.tracks[0]?.notes[0];
  expect(edited).toMatchObject({
    id: note.id,
    pitchMidi: 64,
    fret: 5,
    stringIndex: 2,
    durationTicks: 240,
    source: 'manual',
  });
  expect(document.syncAnchors).toBe(session.document.syncAnchors);
  expect(document.tracks[0]?.id).toBe(track.id);
  const rendered = renderNormalized(document);
  const restored = normalizeScore(rendered.score, rendered.playbackLookup);
  expect(restored.tracks[0]?.notes[0]).toMatchObject({
    pitchMidi: 64,
    durationTicks: 240,
    fret: 5,
    stringIndex: 2,
  });
  expect(buildPracticeTargets(document, 0, 10000, null)[0]).toMatchObject({
    id: note.id,
    pitchMidi: 64,
    songTimeMs: 0,
  });
  expect(JSON.stringify(session.document)).toBe(original);
  expect(session.originalBytes).toEqual(originalBytes);
});
it('20회 편집/Undo/Redo는 정확한 문서로 복귀하고 분기 편집은 redo를 지운다', () => {
  const initial = scoreEditingFixture().document;
  const track = initial.tracks[0];
  const note = track?.notes[0];
  if (!track || !note) throw new Error('테스트 음표 필요');
  let history: EditHistory = { past: [], present: initial, future: [] };
  for (let i = 1; i <= 20; i++)
    history = commitEdit(
      history,
      editNote(history.present, {
        kind: 'UPDATE',
        trackId: track.id,
        noteId: note.id,
        value: {
          startTick: 0,
          durationTicks: note.durationTicks,
          stringIndex: 1,
          fret: i % 12,
        },
      }),
    );
  const final = JSON.stringify(history.present);
  for (let i = 0; i < 20; i++) history = undoEdit(history);
  expect(history.present).toBe(initial);
  expect(undoEdit(history)).toBe(history);
  for (let i = 0; i < 20; i++) history = redoEdit(history);
  expect(JSON.stringify(history.present)).toBe(final);
  history = undoEdit(history);
  history = commitEdit(history, initial);
  expect(history.future).toEqual([]);
  for (let i = 0; i < 110; i++) history = commitEdit(history, initial);
  expect(history.past).toHaveLength(100);
});
it('추가/삭제와 쉼표·빈 트랙도 실제 렌더를 유지하고 잘못된 입력/중첩/타이를 거부한다', () => {
  const session = scoreEditingFixture();
  const track = session.document.tracks[0];
  const note = track?.notes[0];
  if (!track || !note) throw new Error('테스트 음표 필요');
  const deleted = editNote(session.document, {
    kind: 'DELETE',
    trackId: track.id,
    noteId: note.id,
  });
  const added = editNote(deleted, {
    kind: 'ADD',
    trackId: track.id,
    value: { startTick: 0, durationTicks: 180, stringIndex: 6, fret: 1 },
  });
  expect(added.tracks[0]?.notes[0]?.id).not.toBe(note.id);
  renderNormalized(added);
  renderNormalized({
    ...added,
    tracks: added.tracks.map((t) => ({ ...t, notes: [] })),
  });
  for (const value of [
    { startTick: NaN, durationTicks: 480, stringIndex: 1, fret: 0 },
    { startTick: 0, durationTicks: 100, stringIndex: 1, fret: 0 },
    { startTick: 360, durationTicks: 480, stringIndex: 1, fret: 0 },
    { startTick: 0, durationTicks: 480, stringIndex: 7, fret: 0 },
    { startTick: 0, durationTicks: 480, stringIndex: 1, fret: 37 },
  ])
    expect(() =>
      editNote(session.document, { kind: 'ADD', trackId: track.id, value }),
    ).toThrow();
  expect(() =>
    validateEditable({
      ...session.document,
      tracks: [{ ...track, notes: [{ ...note, attack: false }] }],
    }),
  ).toThrow();
  expect(() =>
    editNote(session.document, {
      kind: 'DELETE',
      trackId: 'missing',
      noteId: note.id,
    }),
  ).toThrow();
});
it('정규화 표시를 저장/복원하고 원본 bytes 대신 해당 문서를 렌더하며 알 수 없는 표시를 거부한다', () => {
  const session = scoreEditingFixture();
  const document = {
    ...session.document,
    renderSource: 'NORMALIZED' as const,
    title: '기타 <&> "초안"',
  };
  const restored = decodeScoreDocument(JSON.parse(JSON.stringify(document)));
  expect(restored.renderSource).toBe('NORMALIZED');
  const rendered = renderStoredScore(restored, new Uint8Array([1, 2]));
  expect(rendered.score.title.replace(/\u00a0/g, ' ')).toBe(document.title);
  expect(toNormalizedMusicXml(document)).toContain('&lt;&amp;&gt;');
  for (const renderSource of [null, false, 'OTHER'])
    expect(() => decodeScoreDocument({ ...document, renderSource })).toThrow();
  expect(
    renderStoredScore(session.document, session.originalBytes).score.title,
  ).toBe(session.score.title);
});

it('native JSON처럼 템포 속성 순서가 달라도 같은 값의 렌더 왕복을 허용한다', () => {
  const document = scoreEditingFixture().document;
  document.tempoMap = document.tempoMap.map((t) => ({
    bpm: t.bpm,
    tick: t.tick,
  }));
  expect(() => renderNormalized(document)).not.toThrow();
});

it('반복 occurrence의 마디 번호를 펼치고 마디별 박자·템포/다중 트랙을 왕복한다', () => {
  const session = scoreEditingFixture();
  const first = session.score.masterBars[0];
  const last = session.score.masterBars[1];
  if (!first || !last) throw new Error('테스트 마디 필요');
  first.isRepeatStart = true;
  last.repeatCount = 2;
  session.score.rebuildRepeatGroups();
  const repeated = normalizeScore(session.score);
  const track = repeated.tracks[0];
  const note = track?.notes[0];
  if (!track || !note) throw new Error('테스트 음표 필요');
  const edited = editNote(repeated, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: { startTick: 0, durationTicks: 960, stringIndex: 1, fret: 1 },
  });
  expect(edited.tracks[0]?.notes.at(-1)?.measureIndex).toBe(3);
  expect(renderNormalized(edited).playbackLookup.masterBars).toHaveLength(4);
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 0.1.4 3.1.4 5.1.4 7.1.4 | 0.1.4 3.1.4 5.1.4',
  );
  const second = score.masterBars[1];
  if (!second) throw new Error('테스트 마디 필요');
  second.timeSignatureNumerator = 3;
  second.tempoAutomations = [
    model.Automation.buildTempoAutomation(false, 0, 90, 2),
  ];
  const document = normalizeScore(score);
  const t = document.tracks[0];
  if (!t) throw new Error('테스트 트랙 필요');
  document.tracks.push({
    ...t,
    id: 'second-track',
    notes: t.notes.map((n) => ({
      ...n,
      id: `second-${n.id}`,
      trackId: 'second-track',
    })),
  });
  expect(renderNormalized(document).score.tracks).toHaveLength(2);
});

it('미지원 주법은 계약으로 보존하고 기본 편집·MusicXML 출력으로 소실시키지 않는다', () => {
  const document = scoreEditingFixture().document;
  const note = document.tracks[0]?.notes[0];
  if (!note) throw new Error('자체 음표 필요');
  note.judgementSupport = 'UNSUPPORTED';
  expect(decodeScoreDocument(JSON.parse(JSON.stringify(document)))).toEqual(
    document,
  );
  expect(() => validateEditable(document)).toThrow('미지원 주법');
  expect(() => toNormalizedMusicXml(document)).toThrow('미지원 주법');
  expect(buildPracticeTargets(document, 0, 10000, null)[0]?.unsupported).toBe(
    true,
  );
  for (const bad of [null, false, 'SUPPORTED', ['UNSUPPORTED']]) {
    const value: unknown = {
      ...document,
      tracks: document.tracks.map((t) => ({
        ...t,
        notes: t.notes.map((n) => ({ ...n, judgementSupport: bad })),
      })),
    };
    expect(() => decodeScoreDocument(value)).toThrow(
      'PROJECT_CONTRACT_INVALID',
    );
  }
});
