import { describe, it, expect } from 'vitest';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
  restoreJudgementSupport,
} from './alphaTabAdapter';
import { exporter, importer, model } from '@coderline/alphatab';
import type { ScoreDocument } from '../../entities/score';
import { buildPracticeTargets } from '../practice/practice';
import { renderNormalized, validateEditable } from './normalizedNotation';
import { decodeScoreDocument } from '../../entities/scoreValidation';

// 음마다 v1 주법 목록, 표현 불가면 'UNSUPPORTED', 둘 다 없으면 undefined
const techniqueState = (document: ScoreDocument) =>
  document.tracks[0]!.notes.map(
    (n) => n.judgementSupport ?? (n.techniques ? [...n.techniques] : undefined),
  );
/** 주법 편집 v1 이전에 저장된 모양: v1 주법도 감점 제외로만 남고 주법 필드는 없습니다. */
const legacyOf = (document: ScoreDocument): ScoreDocument => ({
  ...document,
  tracks: document.tracks.map((track) => ({
    ...track,
    notes: track.notes.map((n) => {
      if (!n.techniques) return n;
      const old = { ...n, judgementSupport: 'UNSUPPORTED' as const };
      delete old.techniques;
      delete old.bendSemitones;
      return old;
    }),
  })),
});
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

const slurTuning = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
  .map(
    ([step, octave], i) =>
      `<staff-tuning line="${i + 1}"><tuning-step>${step}</tuning-step><tuning-octave>${octave}</tuning-octave></staff-tuning>`,
  )
  .join('');
const slurNote = (fret: number, step: string, slur = '') =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><notations><technical><string>1</string><fret>${fret}</fret></technical>${slur}</notations></note>`;
const tabMusicXml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Gtr</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>6</staff-lines>${slurTuning}</staff-details></attributes>${body}</measure></part></score-partwise>`;
const slurMusicXml = tabMusicXml(
  `${slurNote(0, 'E', '<slur type="start" number="1"/>')}${slurNote(3, 'G', '<slur type="stop" number="1"/>')}${slurNote(5, 'A')}${slurNote(7, 'B')}`,
);
it.each(['x', 'circle-x'])(
  'MusicXML %s 음표 머리를 데드 음으로 보고 일반 피킹에서 제외하며 다른 음표와 구형 복원을 유지한다',
  (head) => {
    const xHead = `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><notehead>${head}</notehead><notations><technical><string>1</string><fret>0</fret></technical></notations></note>`;
    const score = importScore(
      new TextEncoder().encode(
        tabMusicXml(
          `${xHead}${slurNote(3, 'G')}${slurNote(5, 'A')}${slurNote(7, 'B')}`,
        ),
      ),
    );
    const notes = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats.map(
      (b) => b.notes[0]!,
    );
    // alphaTab keeps the X head as display style only.
    expect(notes.map((n) => n.isDead)).toEqual([false, false, false, false]);
    const document = normalizeScore(score);
    // 주법 편집 v1: X 머리는 편집 가능한 DEAD로 옮기고, 데드는 음정이 없어 감점 제외합니다.
    expect(techniqueState(document)).toEqual([
      ['DEAD'],
      undefined,
      undefined,
      undefined,
    ]);
    expect(
      buildPracticeTargets(document, 0, 3000, null).map(
        (n) => n.unsupported ?? false,
      ),
    ).toEqual([true, false, false, false]);
    expect(() => validateEditable(document)).not.toThrow();
    expect(
      techniqueState(restoreJudgementSupport(legacyOf(document), score)),
    ).toEqual(techniqueState(document));
  },
);

it('MusicXML의 일반·다이아몬드 음표 머리는 X 머리 보호로 제외하지 않는다', () => {
  const head = (name: string, fret: number, step: string) =>
    `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><notehead>${name}</notehead><notations><technical><string>1</string><fret>${fret}</fret></technical></notations></note>`;
  const document = normalizeScore(
    importScore(
      new TextEncoder().encode(
        tabMusicXml(
          `${head('normal', 0, 'E')}${head('diamond', 3, 'G')}${head('cross', 5, 'A')}${slurNote(7, 'B')}`,
        ),
      ),
    ),
  );
  expect(document.tracks[0]!.notes.map((n) => n.judgementSupport)).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});

it.each(['pm', 'lr'])(
  'GP 화음의 한 음에만 있는 %s는 박자 표시로 번지지 않아 같은 박자의 정상 음을 유지한다',
  (effect) => {
    const score = importer.ScoreLoader.loadAlphaTex(
      `. (0.1{${effect}} 3.2).4 5.1.4 7.1.4 8.1.4`,
    );
    const chord = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!;
    // Beat.finish raises the beat flag when any note has it.
    expect(chord.isPalmMute || chord.isLetRing).toBe(true);
    // 팜뮤트는 v1 주법(PALM_MUTE), 음표 렛링은 v2 주법(LET_RING)입니다.
    const first = effect === 'pm' ? ['PALM_MUTE'] : ['LET_RING'];
    const flags = [first, undefined, undefined, undefined, undefined];
    for (const source of [
      score,
      importScore(new exporter.Gp7Exporter().export(score)),
    ]) {
      const document = normalizeScore(source);
      expect(techniqueState(document)).toEqual(flags);
      expect(
        techniqueState(restoreJudgementSupport(legacyOf(document), source)),
      ).toEqual(flags);
    }
  },
);

it('MusicXML P.M. 범위 안에서 음표 표시가 타이 도착음에만 있어도 같은 박자의 새 공격음을 채점하지 않는다', () => {
  const tied = (type: 'start' | 'stop', extra = '') =>
    `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><tie type="${type}"/><type>quarter</type>${extra}<notations><tied type="${type}"/><technical><string>1</string><fret>0</fret></technical></notations></note>`;
  const chordMate = `<note><chord/><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><notations><technical><string>2</string><fret>3</fret></technical></notations></note>`;
  const score = importScore(
    new TextEncoder().encode(
      tabMusicXml(
        `${tied('start')}${rangeDirection('P.M.', 'start')}${tied('stop', '<play><mute>palm</mute></play>')}${chordMate}${rangeDirection('P.M.', 'stop')}${slurNote(5, 'A')}${slurNote(7, 'B')}`,
      ),
    ),
  );
  const beat = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!;
  // Precondition from the review: only the tie destination carries the note flag.
  expect(beat.isPalmMute).toBe(true);
  expect(beat.notes.map((n) => [n.isTieDestination, n.isPalmMute])).toEqual([
    [true, true],
    [false, false],
  ]);
  const document = normalizeScore(score);
  const attacks = buildPracticeTargets(document, 0, 3000, null);
  // 주법 편집 v1: 범위 안의 새 공격음(62)은 PALM_MUTE로 옮기고, 팜뮤트는 음정으로 채점합니다(사용자 결정).
  expect(attacks.filter((t) => !t.unsupported).map((t) => t.pitchMidi)).toEqual(
    [64, 62, 69, 71],
  );
  expect(document.tracks[0]!.notes[2]!.techniques).toEqual(['PALM_MUTE']);
  const legacy = structuredClone(document);
  for (const track of legacy.tracks)
    for (const note of track.notes) delete note.judgementSupport;
  expect(
    restoreJudgementSupport(legacy, score).tracks[0]!.notes.map(
      (n) => n.judgementSupport,
    ),
  ).toEqual(document.tracks[0]!.notes.map((n) => n.judgementSupport));
});

const rangeDirection = (words: string, type: 'start' | 'stop') =>
  `<direction><direction-type><words>${words}</words></direction-type><direction-type><dashes type="${type}"/></direction-type></direction>`;

it.each(['P.M.', 'LetRing'])(
  'MusicXML %s 박자 범위의 음표를 일반 피킹에서 제외하고 범위 밖 음표와 구형 복원을 유지한다',
  (words) => {
    const score = importScore(
      new TextEncoder().encode(
        tabMusicXml(
          `${rangeDirection(words, 'start')}${slurNote(0, 'E')}${slurNote(3, 'G')}${rangeDirection(words, 'stop')}${slurNote(5, 'A')}${slurNote(7, 'B')}`,
        ),
      ),
    );
    const beats = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats;
    // The range lives on the beat only, so the existing note-level checks miss it.
    expect(beats.map((b) => b.isPalmMute || b.isLetRing)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(
      beats.some((b) => b.notes[0]!.isPalmMute || b.notes[0]!.isLetRing),
    ).toBe(false);
    const document = normalizeScore(score);
    const palm = words === 'P.M.';
    const marked = palm ? ['PALM_MUTE'] : 'UNSUPPORTED';
    const flags = [marked, marked, undefined, undefined];
    expect(techniqueState(document)).toEqual(flags);
    // 팜뮤트 범위는 v1 주법이라 채점·편집하고, 렛링 범위는 기존처럼 제외·편집 거부합니다.
    expect(
      buildPracticeTargets(document, 0, 3000, null).map(
        (n) => n.unsupported ?? false,
      ),
    ).toEqual([!palm, !palm, false, false]);
    if (palm) expect(() => validateEditable(document)).not.toThrow();
    else expect(() => validateEditable(document)).toThrow('미지원 주법');
    const legacy = legacyOf(document);
    const before = JSON.stringify(legacy);
    expect(techniqueState(restoreJudgementSupport(legacy, score))).toEqual(
      flags,
    );
    expect(JSON.stringify(legacy)).toBe(before);
  },
);

it.each([
  ['MusicXML', () => importScore(new TextEncoder().encode(slurMusicXml))],
  [
    'AlphaTex',
    () =>
      importer.ScoreLoader.loadAlphaTex(
        '. 0.1{slur "s1"}.4 3.1{slur "s1"}.4 5.1.4 7.1.4',
      ),
  ],
])(
  '%s 슬러 양끝을 일반 피킹에서 제외하고 편집 소실을 막으며 구형 복원에도 적용한다',
  (_source, load) => {
    const score = load();
    const notes = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats.map(
      (b) => b.notes[0]!,
    );
    expect(notes.map((n) => [n.isSlurOrigin, n.isSlurDestination])).toEqual([
      [true, false],
      [false, true],
      [false, false],
      [false, false],
    ]);
    expect(notes.some((n) => n.isHammerPullOrigin)).toBe(false);
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
  },
);

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
])(
  '실제 파서의 음표·박자 효과 %s는 인접 피킹과 분리해 감점 제외하고 편집 소실을 막는다',
  (effect) => {
    const firstNote = ['turn', 'iturn', 'umordent', 'lmordent'].includes(effect)
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

it.each(['장식음', '골페'])(
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
    if (effect === '골페') first.golpe = model.GolpeType.Finger;
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
  // 팜뮤트는 편집 가능한 PALM_MUTE로, 슬라이드는 표현 불가(UNSUPPORTED)로 복원합니다.
  expect(techniqueState(restored)).toEqual([
    ['PALM_MUTE'],
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
    tracks: [{ ...track, notes: track.notes.filter((_, i) => i !== 1) }],
  };
  expect(() => restoreJudgementSupport(mismatched, score)).toThrow(
    '안전하게 채점',
  );
});
it('음표·박자의 지원 불가 효과는 일반 피킹과 분리하고 반복에서도 유지한다', () => {
  const cases: ((n: model.Note) => void)[] = [
    (n) => {
      // 올렸다 내리는 벤딩은 v1 BEND(한 번 올림)가 아니라 표현 불가입니다.
      n.addBendPoint(new model.BendPoint(0, 0));
      n.addBendPoint(new model.BendPoint(30, 4));
      n.addBendPoint(new model.BendPoint(60, 0));
      n.bendType = model.BendType.BendRelease;
    },
    (n) => {
      n.isContinuedBend = true;
    },
    (n) => {
      // 주법 편집 v2: 이어지는 슬라이드(Shift·Legato)는 주법이고, 밖으로 빠지는 슬라이드는 표현 불가입니다.
      n.slideOutType = model.SlideOutType.OutDown;
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
      // 자연 하모닉은 v2 주법이고, 인공 하모닉은 표현 불가입니다.
      n.harmonicType = model.HarmonicType.Artificial;
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
    (n) => {
      n.beat.brushType = model.BrushType.BrushDown;
    },
    (n) => {
      n.beat.brushType = model.BrushType.ArpeggioUp;
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
  first.harmonicType = model.HarmonicType.Artificial;
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

it('악보 파일의 브러시·아르페지오 박자는 화음 전체를 감점 제외하고 다른 박자는 채점한다', () => {
  // AlphaTex 박자 효과: bd 아래로 긁기, au 위로 아르페지오
  const score = importer.ScoreLoader.loadAlphaTex(
    '. (0.1 2.2).4 {bd} (0.1 2.2).4 {au} 3.1.4 5.1.4',
  );
  const beats = score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats ?? [];
  expect(beats.map((b) => b.brushType)).toEqual([
    model.BrushType.BrushDown,
    model.BrushType.ArpeggioUp,
    model.BrushType.None,
    model.BrushType.None,
  ]);
  const notes = normalizeScore(score).tracks[0]?.notes ?? [];
  expect(notes.map((n) => n.judgementSupport ?? 'OK')).toEqual([
    'UNSUPPORTED',
    'UNSUPPORTED',
    'UNSUPPORTED',
    'UNSUPPORTED',
    'OK',
    'OK',
  ]);
});

it('스윙으로 밀린 뒤 음은 악보 위치를 두고 실제 소리 시각(playbackTick)을 따로 기록하고 채점한다', () => {
  const tex =
    '. 0.1.8 2.1.8 3.1.8 5.1.8 0.1.4 2.1.4 | 0.1.8 2.1.8 3.1.4 5.1.4 7.1.4';
  const swingFirstBar = () => {
    const score = importer.ScoreLoader.loadAlphaTex(tex);
    score.masterBars[0]!.tripletFeel = model.TripletFeel.Triplet8th;
    return score;
  };
  const document = normalizeScore(swingFirstBar());
  const notes = document.tracks[0]?.notes ?? [];
  // 첫 마디 8분 짝의 뒤 음(480·1440틱)만 소리 시각이 640·1600입니다. 감점 제외는 하지 않습니다.
  expect(
    notes.map((n) => [
      n.startTick,
      n.playbackTick ?? null,
      n.judgementSupport ?? 'OK',
    ]),
  ).toEqual([
    [0, null, 'OK'],
    [480, 640, 'OK'],
    [960, null, 'OK'],
    [1440, 1600, 'OK'],
    [1920, null, 'OK'],
    [2880, null, 'OK'],
    [3840, null, 'OK'],
    [4320, null, 'OK'],
    [4800, null, 'OK'],
    [5760, null, 'OK'],
    [6720, null, 'OK'],
  ]);
  expect(() => decodeScoreDocument(document)).not.toThrow();
  // 채점 목표는 소리 시각입니다. 120BPM 기본 앵커에서 640틱 = 333.3ms(곧은 위치 250ms 아님).
  const targets = buildPracticeTargets(document, 0, 60000, null);
  expect(targets[1]?.songTimeMs).toBeCloseTo((640 * 500) / 960);
  expect(targets[1]?.unsupported).toBeUndefined();
  // 스윙 없는 같은 악보에는 소리 시각이 없습니다.
  expect(
    (
      normalizeScore(importer.ScoreLoader.loadAlphaTex(tex)).tracks[0]?.notes ??
      []
    ).some((n) => n.playbackTick !== undefined),
  ).toBe(false);
  // 반복해 펼친 occurrence마다 같은 만큼 밀립니다.
  const repeated = swingFirstBar();
  repeated.masterBars[0]!.isRepeatStart = true;
  repeated.masterBars[0]!.repeatCount = 2;
  repeated.rebuildRepeatGroups();
  expect(
    (normalizeScore(repeated).tracks[0]?.notes ?? [])
      .filter((n) => n.playbackTick !== undefined)
      .map((n) => [n.startTick, n.playbackTick]),
  ).toEqual([
    [480, 640],
    [1440, 1600],
    [4320, 4480],
    [5280, 5440],
  ]);
  // 구형 저장 악보(소리 시각 없음)는 원본 악보로 복원할 때 채웁니다.
  const legacy = {
    ...document,
    tracks: document.tracks.map((t) => ({
      ...t,
      notes: t.notes.map((n) => {
        const copy = { ...n };
        delete copy.playbackTick;
        return copy;
      }),
    })),
  };
  const restored = restoreJudgementSupport(legacy, swingFirstBar());
  expect(
    restored.tracks[0]?.notes
      .filter((n) => n.playbackTick)
      .map((n) => n.playbackTick),
  ).toEqual([640, 1600]);
});

it('원본 제목·트랙 이름의 제어문자·공백·길이를 저장 규칙에 맞춰 정리한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4 5.1.4 7.1.4');
  score.title = '  첫 줄\n둘째\t\t줄  ';
  score.tracks[0]!.name = '\t\n';
  const named = normalizeScore(score);
  expect(named.title).toBe('첫 줄 둘째 줄');
  expect(named.tracks[0]?.name).toBe('트랙 1');
  expect(() => decodeScoreDocument(named)).not.toThrow();
  score.title = '가'.repeat(250);
  const long = normalizeScore(score);
  expect([...long.title]).toHaveLength(200);
  expect(() => decodeScoreDocument(long)).not.toThrow();
});

it('GP7 파일로 내보냈다 다시 읽어도 브러시는 감점 제외, 스윙 뒤 음은 소리 시각을 유지한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. (0.1 2.2).4 {bd} 0.1.8 2.1.8 3.1.4 5.1.4',
  );
  score.masterBars[0]!.tripletFeel = model.TripletFeel.Triplet8th;
  const reread = importScore(new exporter.Gp7Exporter().export(score));
  expect(reread.masterBars[0]?.tripletFeel).toBe(model.TripletFeel.Triplet8th);
  expect(
    reread.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.brushType,
  ).toBe(model.BrushType.BrushDown);
  const notes = normalizeScore(reread).tracks[0]?.notes ?? [];
  expect(
    notes.map((n) => [
      n.startTick,
      n.playbackTick ?? null,
      n.judgementSupport ?? 'OK',
    ]),
  ).toEqual([
    [0, null, 'UNSUPPORTED'],
    [0, null, 'UNSUPPORTED'],
    [960, null, 'OK'],
    [1440, 1600, 'OK'],
    [1920, null, 'OK'],
    [2880, null, 'OK'],
  ]);
});

it('주법 편집 v1: 7가지 주법을 편집 가능한 필드로 옮기고, 팜뮤트·스타카토만 채점하며 구형 저장본도 옮긴다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 0.1{pm}.4 0.1{x}.4 0.1{g}.4 0.1{st}.4 | 0.1{v}.4 3.1{b (0 4)}.4 0.1.4 {tt} 5.1{pm st}.4',
  );
  const document = normalizeScore(score);
  expect(techniqueState(document)).toEqual([
    ['PALM_MUTE'],
    ['DEAD'],
    ['GHOST'],
    ['STACCATO'],
    ['VIBRATO'],
    ['BEND'],
    ['TAP'],
    ['PALM_MUTE', 'STACCATO'],
  ]);
  expect(document.tracks[0]!.notes[5]!.bendSemitones).toBe(2);
  expect(() => decodeScoreDocument(document)).not.toThrow();
  expect(
    buildPracticeTargets(document, 0, 60000, null).map(
      (t) => t.unsupported ?? false,
    ),
  ).toEqual([false, true, true, false, true, true, true, false]);
  expect(() => validateEditable(document)).not.toThrow();
  // 예전 저장본(감점 제외로만 남음)도 원본으로 다시 맞추면 편집 가능한 주법이 됩니다.
  const restored = restoreJudgementSupport(legacyOf(document), score);
  expect(techniqueState(restored)).toEqual(techniqueState(document));
  expect(restored.tracks[0]!.notes[5]!.bendSemitones).toBe(2);
});

it('주법 편집 v1: GP7 파일로 저장했다 다시 읽어도 7가지 주법과 벤딩 양이 그대로 옮겨진다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 0.1{pm}.4 0.1{x}.4 0.1{g}.4 0.1{st}.4 | 0.1{v}.4 3.1{b (0 4)}.4 3.1{b (0 2)}.4 0.1.4 {tt}',
  );
  const back = importScore(new exporter.Gp7Exporter().export(score));
  // GP는 데드 노트를 X 머리가 아닌 isDead로, 단순 벤딩을 점 2개로 다시 읽습니다.
  const document = normalizeScore(back);
  expect(
    document.tracks[0]!.notes.map((n) => [
      n.judgementSupport ?? n.techniques,
      n.bendSemitones ?? null,
    ]),
  ).toEqual([
    [['PALM_MUTE'], null],
    [['DEAD'], null],
    [['GHOST'], null],
    [['STACCATO'], null],
    [['VIBRATO'], null],
    [['BEND'], 2],
    [['BEND'], 1],
    [['TAP'], null],
  ]);
});

it('주법 편집 v2: 해머온·슬라이드 2종·자연 하모닉·렛링을 옮기고 피킹 없는 도착 음만 채점에서 뺀다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 0.1{h}.4 2.1.4 3.2{sl}.4 5.2.4 | 0.3{ss}.4 2.3.4 12.4{nh}.4 0.5{lr}.4',
  );
  const document = normalizeScore(score);
  const expected = [
    ['HAMMER'],
    undefined,
    ['SLIDE_LEGATO'],
    undefined,
    ['SLIDE_SHIFT'],
    undefined,
    ['HARMONIC_NATURAL'],
    ['LET_RING'],
  ];
  expect(techniqueState(document)).toEqual(expected);
  // 해머·이어 치기 슬라이드 도착 음은 피킹이 없고, 자연 하모닉은 음정 판정이 달라 제외합니다.
  expect(
    buildPracticeTargets(document, 0, 10000, null).map(
      (n) => n.unsupported ?? false,
    ),
  ).toEqual([false, true, false, true, false, false, true, false]);
  expect(() => validateEditable(document)).not.toThrow();
  expect(() => renderNormalized(document)).not.toThrow();
  expect(
    techniqueState(
      normalizeScore(importScore(new exporter.Gp7Exporter().export(score))),
    ),
  ).toEqual(expected);
  // v2 이전 저장본: 주법 음과 도착 음이 모두 감점 제외로만 남아 있었습니다.
  const legacy = legacyOf(document);
  for (const index of [1, 3]) {
    const note = legacy.tracks[0]!.notes[index]!;
    legacy.tracks[0]!.notes[index] = {
      ...note,
      judgementSupport: 'UNSUPPORTED',
    };
  }
  expect(techniqueState(restoreJudgementSupport(legacy, score))).toEqual(
    expected,
  );
});

it('주법 편집 v2: 밖으로 빠지는 슬라이드는 표현 불가, 도착 음 없는 해머온은 일반 음이다', () => {
  const document = normalizeScore(
    importer.ScoreLoader.loadAlphaTex('. 0.1{sod}.4 3.1.4 5.1{h}.4 7.2.4'),
  );
  expect(document.tracks[0]!.notes[0]!.judgementSupport).toBe('UNSUPPORTED');
  // 같은 줄 도착 음이 없는 h는 alphaTab이 불러올 때 지워 일반 음이 됩니다.
  expect(document.tracks[0]!.notes[2]!.judgementSupport).toBeUndefined();
  expect(() => validateEditable(document)).toThrow('미지원 주법');
});

it('주법 편집 v2: 다른 성부 음이 끼어 v2 규칙의 도착 음이 alphaTab과 다르면 이음을 표현 불가로 두고 실제 도착 음도 감점 제외한다', () => {
  // 1성부 0→2 해머온 사이에 2성부의 같은 줄 5프렛 음이 끼어 있습니다.
  const score = importer.ScoreLoader.loadAlphaTex(
    '\\track "A" \\staff {tabs} \\voice 0.1{h}.2 2.1.2 | 0.1.1 \\voice r.4 5.1.4 r.2 | r.1',
  );
  const document = normalizeScore(score);
  expect(
    document.tracks[0]!.notes.map((n) => [
      n.fret,
      n.judgementSupport ?? n.techniques ?? null,
    ]),
  ).toEqual([
    [0, 'UNSUPPORTED'],
    [5, null],
    [2, 'UNSUPPORTED'],
    [0, null],
  ]);
  expect(
    buildPracticeTargets(document, 0, 5000, null).map(
      (n) => n.unsupported ?? false,
    ),
  ).toEqual([true, false, true, false]);
  expect(() => validateEditable(document)).toThrow('미지원 주법');
  expect(
    techniqueState(restoreJudgementSupport(legacyOf(document), score)),
  ).toEqual(techniqueState(document));
});

it('주법 편집 v2: 반복 끝 음의 해머온은 다음 마디로 갈 때만 이음이고, 반복 시작으로 돌아갈 때는 감점 제외로 둔다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 0.1.4 3.1.4 5.1.4 7.1{h}.4 | 9.1.4 3.1.4 5.1.4 7.1.4',
  );
  score.masterBars[0]!.isRepeatStart = true;
  score.masterBars[0]!.repeatCount = 2;
  score.rebuildRepeatGroups();
  const document = normalizeScore(score);
  // 첫 회차 7→0(반복 시작)은 alphaTab의 도착 음(9)과 달라 표현 불가, 둘째 회차 7→9는 해머온입니다.
  expect(document.tracks[0]!.notes[3]!.judgementSupport).toBe('UNSUPPORTED');
  expect(document.tracks[0]!.notes[7]!.techniques).toEqual(['HAMMER']);
  expect(
    buildPracticeTargets(document, 0, 9000, null).map(
      (n) => n.unsupported ?? false,
    ),
  ).toEqual([
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
  ]);
});

it('주법 편집 v2: 5·7프렛 자연 하모닉은 프렛 음정으로 저장해 편집·그리기·GP7 왕복이 된다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 7.1{nh}.4 5.2{nh}.4 3.1.4 5.1.4',
  );
  const document = normalizeScore(score);
  // 1번 줄(E4=64) 7프렛 = 71, 2번 줄(B3=59) 5프렛 = 64. 소리 음정(83·71)이 아닙니다.
  expect(
    document.tracks[0]!.notes.map((n) => [n.pitchMidi, n.techniques ?? null]),
  ).toEqual([
    [71, ['HARMONIC_NATURAL']],
    [64, ['HARMONIC_NATURAL']],
    [67, null],
    [69, null],
  ]);
  expect(() => validateEditable(document)).not.toThrow();
  expect(() => renderNormalized(document)).not.toThrow();
  expect(
    normalizeScore(
      importScore(new exporter.Gp7Exporter().export(score)),
    ).tracks[0]!.notes.map((n) => n.pitchMidi),
  ).toEqual([71, 64, 67, 69]);
});

it('앞당기는 스윙(Scottish)은 계약에 맞지 않는 소리 시각을 만들지 않고 감점 제외로 둔다', () => {
  for (const feel of [
    model.TripletFeel.Scottish8th,
    model.TripletFeel.Scottish16th,
  ]) {
    const score = importer.ScoreLoader.loadAlphaTex(
      '. 0.1.8 2.1.8 3.1.8 5.1.8 0.1.16 2.1.16 3.1.16 5.1.16 0.1.4',
    );
    score.masterBars[0]!.tripletFeel = feel;
    const document = normalizeScore(score);
    // 저장 계약(TS·Rust 공통)을 통과해야 프로젝트를 저장할 수 있습니다.
    expect(() =>
      decodeScoreDocument(JSON.parse(JSON.stringify(document))),
    ).not.toThrow();
    const notes = document.tracks[0]!.notes;
    expect(notes.every((n) => n.playbackTick === undefined)).toBe(true);
    expect(notes.some((n) => n.judgementSupport === 'UNSUPPORTED')).toBe(true);
    const legacy = structuredClone(document);
    for (const n of legacy.tracks[0]!.notes) delete n.judgementSupport;
    expect(techniqueState(restoreJudgementSupport(legacy, score))).toEqual(
      techniqueState(document),
    );
  }
});

it('자연 하모닉이면서 다른 미지원 주법이 있는 음은 예전처럼 소리 음정으로 남아, v2 이전 저장본이 그대로 열린다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 7.1{nh}.4 7.1{nh}.4 3.1.4 5.1.4',
  );
  // 첫 음에만 브러시(미지원 박자 효과)를 둡니다.
  score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.brushType =
    model.BrushType.BrushDown;
  const document = normalizeScore(score);
  expect(
    document.tracks[0]!.notes.map((n) => [
      n.pitchMidi,
      n.judgementSupport ?? n.techniques ?? null,
    ]),
  ).toEqual([
    [83, 'UNSUPPORTED'],
    [71, ['HARMONIC_NATURAL']],
    [67, null],
    [69, null],
  ]);
  // v2 이전 저장본: 자연 하모닉은 모두 소리 음정(83)·미지원이었습니다.
  const legacy = structuredClone(document);
  const second = legacy.tracks[0]!.notes[1]!;
  legacy.tracks[0]!.notes[1] = {
    ...second,
    pitchMidi: 83,
    judgementSupport: 'UNSUPPORTED',
  };
  delete legacy.tracks[0]!.notes[1]!.techniques;
  expect(() => restoreJudgementSupport(legacy, score)).not.toThrow();
  expect(
    restoreJudgementSupport(legacy, score).tracks[0]!.notes.map(
      (n) => n.judgementSupport ?? null,
    ),
  ).toEqual(['UNSUPPORTED', 'UNSUPPORTED', null, null]);
});

it('주법 편집 v2: 같은 tick·같은 줄 도착 후보가 여럿이면 이음을 옮기지 않아, 열 때마다 결과가 같다', () => {
  // 1성부 0→2 해머온과 같은 tick(1920)·같은 줄에 2성부 5프렛 음이 있습니다.
  const score = importer.ScoreLoader.loadAlphaTex(
    '\\track "A" \\staff {tabs} \\voice 0.1{h}.2 2.1.2 | 0.1.1 \\voice r.2 5.1.2 | r.1',
  );
  const shape = () =>
    normalizeScore(score).tracks[0]!.notes.map((n) => [
      n.startTick,
      n.fret,
      n.judgementSupport ?? n.techniques ?? null,
    ]);
  const first = shape();
  expect(first.find((n) => n[0] === 0 && n[1] === 0)?.[2]).toBe('UNSUPPORTED');
  for (let i = 0; i < 20; i++) expect(shape()).toEqual(first);
  const document = normalizeScore(score);
  const legacy = structuredClone(document);
  for (let i = 0; i < 10; i++)
    expect(() => restoreJudgementSupport(legacy, score)).not.toThrow();
});

it('주법 편집 v2: AlphaTex로 같은 소리를 다시 만들 수 없는 자연 하모닉은 미지원으로 둔다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 3.1{nh}.4 12.1{nh}.4 5.1.4 7.1.4',
  );
  const notes = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats.map(
    (beat) => beat.notes[0]!,
  );
  // GP 원본처럼 3프렛 하모닉의 터치 위치를 AlphaTex 계산(3.2)과 다르게 둡니다.
  notes[0]!.harmonicValue = 2.7;
  const document = normalizeScore(score);
  expect(
    document.tracks[0]!.notes.map((n) => [
      n.pitchMidi,
      n.judgementSupport ?? n.techniques ?? null,
    ]),
  ).toEqual([
    [notes[0]!.realValue, 'UNSUPPORTED'],
    [76, ['HARMONIC_NATURAL']],
    [69, null],
    [71, null],
  ]);
  expect(() => validateEditable(document)).toThrow('미지원 주법');
});

it('주법 편집 v2: 해머온과 슬라이드가 함께 붙은 음은 이음 하나로 줄이지 않고 도착 음까지 미지원으로 둔다', () => {
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 7.1{h sl}.4 9.1.4 3.1.4 5.1.4',
  );
  const first =
    score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!;
  // 전제: alphaTab이 두 표기를 모두 읽습니다.
  expect([first.isHammerPullOrigin, first.slideOutType]).toEqual([
    true,
    model.SlideOutType.Legato,
  ]);
  for (const source of [
    score,
    importScore(new exporter.Gp7Exporter().export(score)),
  ]) {
    const document = normalizeScore(source);
    expect(techniqueState(document)).toEqual([
      'UNSUPPORTED',
      'UNSUPPORTED',
      undefined,
      undefined,
    ]);
    expect(
      buildPracticeTargets(document, 0, 3000, null).map(
        (n) => n.unsupported ?? false,
      ),
    ).toEqual([true, true, false, false]);
  }
});

it('복원: 같은 자리에 지원 음과 미지원 음이 겹치면 미지원 제외 표시를 지우지 않는다', () => {
  // 1성부 해머온 도착 음(2프렛, 1920)과 2성부 타이 도착 음이 같은 줄·프렛·시각에 겹칩니다.
  const score = importer.ScoreLoader.loadAlphaTex(
    '\\track "A" \\staff {tabs} \\voice 0.1{h}.2 2.1.2 | r.1 \\voice 2.1.2 -.1.2 | r.1',
  );
  const document = normalizeScore(score);
  const unsupported = (d: ScoreDocument) =>
    d.tracks[0]!.notes.filter((n) => n.judgementSupport === 'UNSUPPORTED').map(
      (n) => n.id,
    );
  expect(unsupported(document)).toHaveLength(2);
  const restored = restoreJudgementSupport(structuredClone(document), score);
  // 같은 자리의 타이 도착 음까지 미지원으로 덮일 수는 있어도, 원래 미지원 음은 남아야 합니다.
  expect(unsupported(restored)).toEqual(
    expect.arrayContaining(unsupported(document)),
  );
});
