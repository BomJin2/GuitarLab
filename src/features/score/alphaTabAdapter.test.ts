import { describe, it, expect } from 'vitest';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
  restoreJudgementSupport,
} from './alphaTabAdapter';
import { exporter, importer, model } from '@coderline/alphatab';
import { buildPracticeTargets } from '../practice/practice';
import { validateEditable } from './normalizedNotation';
import { decodeScoreDocument } from '../../entities/scoreValidation';

it('박자 레가토의 시작·도착음을 일반 피킹에서 제외하고 GP·구형 복원에서도 원본과 정상음을 유지한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 0.1.4 {legatoorigin} 3.1.4 5.1.4 7.1.4',
  );
  const beats = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats;
  expect(beats[0]!.isLegatoOrigin).toBe(true);
  expect(beats[1]!.isLegatoDestination).toBe(true);
  expect(
    beats
      .flatMap((b) => b.notes)
      .some((n) => n.isHammerPullOrigin || n.isHammerPullDestination),
  ).toBe(false);
  const document = normalizeScore(score);
  const flags = ['UNSUPPORTED', 'UNSUPPORTED', undefined, undefined];
  expect(document.tracks[0]!.notes.map((n) => n.judgementSupport)).toEqual(
    flags,
  );
  expect(
    buildPracticeTargets(document, 0, 3000, null).map(
      (n) => n.unsupported ?? false,
    ),
  ).toEqual([true, true, false, false]);
  expect(() => validateEditable(document)).toThrow('미지원 주법');
  const legacy = structuredClone(document);
  for (const track of legacy.tracks)
    for (const note of track.notes) delete note.judgementSupport;
  const before = JSON.stringify(legacy);
  const restored = restoreJudgementSupport(legacy, score);
  expect(restored.tracks[0]!.notes.map((n) => n.judgementSupport)).toEqual(
    flags,
  );
  expect(restored.tracks[0]!.notes.map((n) => n.id)).toEqual(
    legacy.tracks[0]!.notes.map((n) => n.id),
  );
  expect(restored.syncAnchors).toBe(legacy.syncAnchors);
  expect(JSON.stringify(legacy)).toBe(before);
  const binary = new exporter.Gp7Exporter().export(score);
  const original = binary.slice();
  expect(
    normalizeScore(importScore(binary)).tracks[0]!.notes.map(
      (n) => n.judgementSupport,
    ),
  ).toEqual(flags);
  expect(binary).toEqual(original);
});

it('반복된 박자 레가토를 구형 악보에서 복원해도 ID·시각·정상 피킹과 원본을 유지한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4 5.1.4 7.1.4');
  score.masterBars[0]!.isRepeatStart = true;
  score.masterBars[0]!.repeatCount = 2;
  score.rebuildRepeatGroups();
  const lookup = buildPlaybackLookup(score);
  const legacy = normalizeScore(score, lookup);
  const original = JSON.stringify(legacy);
  score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.isLegatoOrigin = true;
  const restored = restoreJudgementSupport(legacy, score, lookup);
  expect(
    restored.tracks[0]!.notes.map((n) => n.judgementSupport === 'UNSUPPORTED'),
  ).toEqual([true, true, false, false, true, true, false, false]);
  expect(
    restored.tracks[0]!.notes.map((n) => [
      n.id,
      n.notationNoteId,
      n.startTick,
      n.pitchMidi,
    ]),
  ).toEqual(
    legacy.tracks[0]!.notes.map((n) => [
      n.id,
      n.notationNoteId,
      n.startTick,
      n.pitchMidi,
    ]),
  );
  expect(restored.syncAnchors).toBe(legacy.syncAnchors);
  expect(JSON.stringify(legacy)).toBe(original);
  expect(restoreJudgementSupport(restored, score, lookup)).toBe(restored);
});

it.each([
  'tt',
  's',
  'p',
  'ds',
  'glpf',
  'glpt',
  'f',
  'fo',
  'vs',
  'rasg "ii"',
  'turn',
  'iturn',
  'umordent',
  'lmordent',
  'gr ob',
  'lr',
  'st',
])(
  '실제 파서의 음표·박자 효과 %s는 인접 피킹과 분리해 감점 제외하고 편집 소실을 막는다',
  (effect) => {
    const firstNote = [
      'turn',
      'iturn',
      'umordent',
      'lmordent',
      'lr',
      'st',
    ].includes(effect)
      ? `0.1{${effect}}.4`
      : `0.1.4 {${effect}}`;
    const score = importer.ScoreLoader.loadAlphaTex(
      `. ${firstNote} 3.1.4 5.1.4 7.1.4`,
    );
    const first = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!;
    expect(first.notes[0]!.isLeftHandTapped).toBe(false);
    expect(
      first.tap ||
        first.slap ||
        first.pop ||
        first.deadSlapped ||
        first.golpe !== model.GolpeType.None ||
        first.fade !== model.FadeType.None ||
        first.hasRasgueado ||
        first.notes[0]!.isLetRing ||
        first.notes[0]!.isStaccato ||
        first.notes[0]!.ornament !== model.NoteOrnament.None ||
        first.graceType !== model.GraceType.None,
    ).toBe(true);
    const document = normalizeScore(score);
    expect(document.tracks[0]!.notes.map((n) => n.judgementSupport)).toEqual([
      'UNSUPPORTED',
      undefined,
      undefined,
      undefined,
    ]);
    expect(
      buildPracticeTargets(document, 0, 3000, null).map(
        (n) => n.unsupported ?? false,
      ),
    ).toEqual([true, false, false, false]);
    expect(() => validateEditable(document)).toThrow('미지원 주법');
    expect(decodeScoreDocument(JSON.parse(JSON.stringify(document)))).toEqual(
      document,
    );
    const binary = new exporter.Gp7Exporter().export(score);
    const before = binary.slice();
    const imported = normalizeScore(importScore(binary));
    expect(imported.tracks[0]!.notes.map((n) => n.judgementSupport)).toEqual(
      document.tracks[0]!.notes.map((n) => n.judgementSupport),
    );
    expect(binary).toEqual(before);
  },
);

it('마디 안의 before-beat 꾸밈음은 시각/원본을 유지하고 구형 표기 복원과 GP 왕복에서도 보류한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 3.1.4 0.1.4 {gr} 5.1.4 7.1.4',
  );
  const grace = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!;
  expect(grace.graceType).toBe(model.GraceType.BeforeBeat);
  const document = normalizeScore(score);
  expect(document.tracks[0]!.notes[1]!.startTick).toBe(840);
  const flags = [undefined, 'UNSUPPORTED', undefined, undefined];
  expect(document.tracks[0]!.notes.map((n) => n.judgementSupport)).toEqual(
    flags,
  );
  expect(
    buildPracticeTargets(document, 0, 3000, null).map(
      (n) => n.unsupported ?? false,
    ),
  ).toEqual([false, true, false, false]);
  expect(() => validateEditable(document)).toThrow('미지원 주법');
  const legacy = structuredClone(document);
  for (const track of legacy.tracks)
    for (const note of track.notes) delete note.judgementSupport;
  const before = JSON.stringify(legacy);
  const restored = restoreJudgementSupport(legacy, score);
  expect(restored.tracks[0]!.notes.map((n) => n.judgementSupport)).toEqual(
    flags,
  );
  expect(restored.tracks[0]!.notes.map((n) => n.id)).toEqual(
    legacy.tracks[0]!.notes.map((n) => n.id),
  );
  expect(restored.syncAnchors).toBe(legacy.syncAnchors);
  expect(JSON.stringify(legacy)).toBe(before);
  const binary = new exporter.Gp7Exporter().export(score);
  const bytes = binary.slice();
  expect(
    normalizeScore(importScore(binary)).tracks[0]!.notes.map(
      (n) => n.judgementSupport,
    ),
  ).toEqual(flags);
  expect(binary).toEqual(bytes);
});

it('첫 마디 전 음수 꾸밈음은 임의로 시각을 바꾸지 않고 기존 도메인에서 거부한다', () => {
  const document = normalizeScore(
    importer.ScoreLoader.loadAlphaTex('. 0.1.4 {gr} 3.1.4 5.1.4 7.1.4'),
  );
  const before = JSON.stringify(document);
  expect(document.tracks[0]!.notes[0]!.startTick).toBe(-120);
  expect(() => decodeScoreDocument(JSON.parse(before))).toThrow();
  expect(JSON.stringify(document)).toBe(before);
});

it.each(['태핑', '장식음', '골페', '렛링', '스타카토'])(
  '%s의 반복/구형 복원은 ID·싱크·이전 내용을 유지하며 두 occurrence를 보류한다',
  (effect) => {
    const score = importer.ScoreLoader.loadAlphaTex(
      '. 0.1.4 3.1.4 5.1.4 7.1.4',
    );
    score.masterBars[0]!.isRepeatStart = true;
    score.masterBars[0]!.repeatCount = 2;
    score.rebuildRepeatGroups();
    const lookup = buildPlaybackLookup(score);
    const legacy = normalizeScore(score, lookup);
    const before = JSON.stringify(legacy);
    const first = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!;
    if (effect === '태핑') first.tap = true;
    else if (effect === '골페') first.golpe = model.GolpeType.Finger;
    else if (effect === '렛링') first.notes[0]!.isLetRing = true;
    else if (effect === '스타카토') first.notes[0]!.isStaccato = true;
    else first.notes[0]!.ornament = model.NoteOrnament.Turn;
    const restored = restoreJudgementSupport(legacy, score, lookup);
    expect(
      restored.tracks[0]!.notes.map(
        (n) => n.judgementSupport === 'UNSUPPORTED',
      ),
    ).toEqual([true, false, false, false, true, false, false, false]);
    expect(restored.tracks[0]!.notes.map((n) => n.id)).toEqual(
      legacy.tracks[0]!.notes.map((n) => n.id),
    );
    expect(restored.syncAnchors).toBe(legacy.syncAnchors);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(restoreJudgementSupport(restored, score, lookup)).toBe(restored);
  },
);
describe('악보 import 계약', () => {
  it('자체 단음의 피치·tick·운지를 유지한다', () => {
    const score = importer.ScoreLoader.loadAlphaTex(
      '\\title "자체 자료" . 0.1.4 3.1.4 5.1.4 7.1.4 | 0.1.4 3.1.4 5.1.4 7.1.4',
    );
    const document = normalizeScore(score);
    expect(document.tracks[0]?.notes.map((n) => n.pitchMidi)).toEqual([
      64, 67, 69, 71, 64, 67, 69, 71,
    ]);
    expect(document.tracks[0]?.notes.map((n) => n.startTick)).toEqual([
      0, 960, 1920, 2880, 3840, 4800, 5760, 6720,
    ]);
    expect(document.tracks[0]?.notes[0]?.stringIndex).toBe(1);
    expect(document.tracks[0]?.tuningMidi).toEqual([64, 59, 55, 50, 45, 40]);
  });
  it('빈 파일·큰 파일·손상 파일은 거부한다', () => {
    expect(() => importScore(new Uint8Array())).toThrow();
    expect(() => importScore(new Uint8Array(8 * 1024 * 1024 + 1))).toThrow();
    expect(() => importScore(new Uint8Array([1, 2, 3]))).toThrow();
  });
});

it('반복 occurrence는 별도 목표 ID와 동일 원본 ID를 유지한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4 5.1.4 7.1.4');
  const bar = score.masterBars[0];
  if (!bar) throw new Error('fixture 누락');
  bar.isRepeatStart = true;
  bar.repeatCount = 2;
  score.rebuildRepeatGroups();
  const document = normalizeScore(score);
  const notes = document.tracks[0]?.notes ?? [];
  expect(notes).toHaveLength(8);
  expect(notes[0]?.id).not.toBe(notes[4]?.id);
  expect(notes[0]?.notationNoteId).toBe(notes[4]?.notationNoteId);
  expect(notes[4]?.startTick).toBe(3840);
});
it('템포와 박자 변경은 기본 앵커와 정규화에 유지한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 0.1.4 3.1.4 5.1.4 7.1.4 | 0.1.4 3.1.4 5.1.4',
  );
  const first = score.masterBars[0];
  const second = score.masterBars[1];
  if (!first || !second) throw new Error('fixture 누락');
  second.timeSignatureNumerator = 3;
  second.timeSignatureDenominator = 4;
  second.tempoAutomations = [
    model.Automation.buildTempoAutomation(false, 0, 90, 2),
  ];
  const document = normalizeScore(score);
  expect(document.tempoMap.at(-1)?.bpm).toBe(90);
  expect(document.timeSignatures.at(-1)?.numerator).toBe(3);
});

it('고급 주법을 감점 제외로 정규화하고 기존 악보 ID·싱크·역할을 비파괴 복원한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4 5.1.4 7.1.4');
  const legacy = normalizeScore(score);
  const track = legacy.tracks[0];
  const notes = score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats.flatMap(
    (b) => b.notes,
  );
  if (!track || !notes?.[0] || !notes[1]) throw new Error('자체 악보 필요');
  const before = JSON.stringify(legacy);
  expect(restoreJudgementSupport(legacy, score)).toBe(legacy);
  notes[0].isPalmMute = true;
  notes[1].slideInType = model.SlideInType.IntoFromBelow;
  const restored = restoreJudgementSupport(legacy, score);
  expect(restored.tracks[0]?.notes.map((n) => n.judgementSupport)).toEqual([
    'UNSUPPORTED',
    'UNSUPPORTED',
    undefined,
    undefined,
  ]);
  expect(restored.id).toBe(legacy.id);
  expect(restored.syncAnchors).toBe(legacy.syncAnchors);
  expect(restored.tracks[0]?.notes.map((n) => n.id)).toEqual(
    track.notes.map((n) => n.id),
  );
  expect(JSON.stringify(legacy)).toBe(before);
  expect(restoreJudgementSupport(restored, score)).toBe(restored);
  const mismatched = {
    ...legacy,
    tracks: [{ ...track, notes: track.notes.slice(1) }],
  };
  expect(() => restoreJudgementSupport(mismatched, score)).toThrow(
    '안전하게 채점',
  );
});
it('음표·박자의 지원 불가 효과는 일반 피킹과 분리하고 반복에서도 유지한다', () => {
  const cases: ((n: model.Note) => void)[] = [
    (n) => {
      n.addBendPoint(new model.BendPoint(0, 0));
      n.addBendPoint(new model.BendPoint(60, 4));
      n.bendType = model.BendType.Bend;
    },
    (n) => {
      n.isContinuedBend = true;
    },
    (n) => {
      n.slideOutType = model.SlideOutType.Shift;
    },
    (n) => {
      n.slideOrigin = new model.Note();
    },
    (n) => {
      n.isHammerPullOrigin = true;
    },
    (n) => {
      n.hammerPullOrigin = new model.Note();
    },
    (n) => {
      n.isLeftHandTapped = true;
    },
    (n) => {
      n.isGhost = true;
    },
    (n) => {
      n.isPalmMute = true;
    },
    (n) => {
      n.isDead = true;
    },
    (n) => {
      n.harmonicType = model.HarmonicType.Natural;
    },
    (n) => {
      n.vibrato = model.VibratoType.Slight;
    },
    (n) => {
      n.trillValue = 64;
    },
    (n) => {
      n.beat.addWhammyBarPoint(new model.BendPoint(0, 0));
      n.beat.addWhammyBarPoint(new model.BendPoint(60, -4));
      n.beat.whammyBarType = model.WhammyType.Dive;
    },
    (n) => {
      n.beat.tremoloSpeed = model.Duration.Sixteenth;
    },
    (n) => {
      n.beat.vibrato = model.VibratoType.Wide;
    },
  ];
  for (const [index, apply] of cases.entries()) {
    const score = importer.ScoreLoader.loadAlphaTex(
      '. 0.1.4 3.1.4 5.1.4 7.1.4',
    );
    const note =
      score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0];
    if (!note) throw new Error('자체 음표 필요');
    const lookup = buildPlaybackLookup(score);
    apply(note);
    expect(
      normalizeScore(score, lookup).tracks[0]?.notes[0]?.judgementSupport,
      `효과 ${index}`,
    ).toBe('UNSUPPORTED');
  }
  const repeated = importer.ScoreLoader.loadAlphaTex(
    '. 0.1.4 3.1.4 5.1.4 7.1.4',
  );
  const first =
    repeated.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0];
  if (!first) throw new Error('자체 음표 필요');
  first.isPalmMute = true;
  const bar = repeated.masterBars[0];
  if (!bar) throw new Error('자체 마디 필요');
  bar.isRepeatStart = true;
  bar.repeatCount = 2;
  repeated.rebuildRepeatGroups();
  const notes = normalizeScore(repeated).tracks[0]?.notes ?? [];
  expect(
    notes.filter((n) => n.judgementSupport === 'UNSUPPORTED'),
  ).toHaveLength(2);
});
