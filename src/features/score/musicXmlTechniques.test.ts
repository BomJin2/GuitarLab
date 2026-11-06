import { expect, it } from 'vitest';
import {
  importScore,
  normalizeScore,
  restoreJudgementSupport,
} from './alphaTabAdapter';
import { buildPracticeTargets } from '../practice/practice';
import { prepareEditingDocument, validateEditable } from './normalizedNotation';
import type { ScoreSession } from './scoreSession';
import { zipSync } from 'fflate';
import { importLocalMedia, localMediaKind } from './localMediaImport';

// docs/12 주법 편집 v2 "MusicXML 보강"
const tuning = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2']
  .map(
    (p, i) =>
      `<staff-tuning line="${6 - i}"><tuning-step>${p[0]}</tuning-step><tuning-octave>${p[1]}</tuning-octave></staff-tuning>`,
  )
  .join('');
const steps: Record<number, [string, number, number]> = {
  0: ['E', 0, 4],
  2: ['F', 1, 4],
  3: ['G', 0, 4],
  5: ['A', 0, 4],
  7: ['B', 0, 4],
  12: ['E', 0, 5],
};
/** 1번 줄 4분음표. extra는 <notations> 안, tech는 <technical> 안에 들어갑니다. */
const note = (
  fret: number,
  { tech = '', extra = '', chord = false, string = 1, voice = 1 } = {},
) => {
  const [step, alter, octave] =
    string === 1 ? steps[fret]! : (['D', 0, 4] as const);
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch><duration>2</duration><voice>${voice}</voice><type>quarter</type><notations>${extra}<technical><string>${string}</string><fret>${fret}</fret>${tech}</technical></notations></note>`;
};
const xmlOf = (body: string) =>
  new TextEncoder().encode(
    `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Gtr</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>6</staff-lines>${tuning}</staff-details></attributes>${body}</measure></part></score-partwise>`,
  );
const score = (body: string) => importScore(xmlOf(body));
const state = (body: string) =>
  normalizeScore(score(body)).tracks[0]!.notes.map((n) => [
    n.fret,
    n.judgementSupport ?? n.techniques ?? null,
  ]);
const start = (kind = 'hammer-on') => `<${kind} type="start">H</${kind}>`;
const stop = (kind = 'hammer-on') => `<${kind} type="stop"/>`;

it('해머온·풀오프 시작 음을 HAMMER로 옮기고 도착 음은 피킹이 없어 채점에서 뺀다', () => {
  for (const kind of ['hammer-on', 'pull-off']) {
    const body = `${note(0, { tech: start(kind) })}${note(2, { tech: stop(kind) })}${note(5)}${note(7)}`;
    expect(state(body)).toEqual([
      [0, ['HAMMER']],
      [2, null],
      [5, null],
      [7, null],
    ]);
    const document = normalizeScore(score(body));
    expect(
      buildPracticeTargets(document, 0, 3000, null).map(
        (n) => n.unsupported ?? false,
      ),
    ).toEqual([false, true, false, false]);
    expect(() => validateEditable(document)).not.toThrow();
  }
});

it('해머온 두 음에 정확히 걸친 슬러는 지우고, 더 긴 슬러는 표현 불가로 남긴다', () => {
  const slur = (type: string) => `<slur type="${type}" number="1"/>`;
  expect(
    state(
      `${note(0, { tech: start(), extra: slur('start') })}${note(2, { tech: stop(), extra: slur('stop') })}${note(5)}${note(7)}`,
    ),
  ).toEqual([
    [0, ['HAMMER']],
    [2, null],
    [5, null],
    [7, null],
  ]);
  expect(
    state(
      `${note(0, { tech: start(), extra: slur('start') })}${note(2, { tech: stop() })}${note(5, { extra: slur('stop') })}${note(7)}`,
    ),
  ).toEqual([
    [0, 'UNSUPPORTED'],
    [2, null],
    [5, 'UNSUPPORTED'],
    [7, null],
  ]);
});

it('화음과 <backup> 성부의 시작 위치를 계산해 줄·프렛이 맞는 음에만 옮긴다', () => {
  // 화음: 1번 줄 0프렛(해머온)과 3번 줄 0프렛이 같은 박자에 있습니다.
  expect(
    state(
      `${note(0, { tech: start() })}${note(0, { chord: true, string: 3 })}${note(2, { tech: stop() })}${note(5)}${note(7)}`,
    ),
  ).toEqual([
    [0, ['HAMMER']],
    [0, null],
    [2, null],
    [5, null],
    [7, null],
  ]);
  // 2성부(<backup> 뒤)의 3번째 박자 음에 해머온이 있습니다.
  const voice2 = `<backup><duration>8</duration></backup>${note(0, { string: 3, voice: 2 })}${note(0, { string: 3, voice: 2 })}${note(0, { string: 3, voice: 2, tech: start() })}${note(2, { string: 3, voice: 2, tech: stop() })}`;
  const notes = normalizeScore(
    score(`${note(0)}${note(3)}${note(5)}${note(7)}${voice2}`),
  ).tracks[0]!.notes;
  expect(
    notes
      .filter((n) => n.techniques)
      .map((n) => [n.startTick, n.stringIndex, n.techniques]),
  ).toEqual([[1920, 3, ['HAMMER']]]);
});

it('자연 하모닉은 옮기고 인공 하모닉은 표현 불가로 둔다', () => {
  expect(
    state(
      `${note(12, { tech: '<harmonic><natural/></harmonic>' })}${note(2)}${note(5)}${note(7)}`,
    ),
  ).toEqual([
    [12, ['HARMONIC_NATURAL']],
    [2, null],
    [5, null],
    [7, null],
  ]);
  expect(
    state(
      `${note(12, { tech: '<harmonic><artificial/></harmonic>' })}${note(2)}${note(5)}${note(7)}`,
    )[0],
  ).toEqual([12, 'UNSUPPORTED']);
});

it('짝이 하나로 정해지지 않거나 표기가 없으면 아무것도 바꾸지 않는다', () => {
  // 같은 박자·줄·프렛 음이 두 성부에 있어 모호합니다.
  const twin = `${note(0, { tech: start() })}${note(2)}${note(5)}${note(7)}<backup><duration>8</duration></backup>${note(0, { voice: 2 })}${note(3, { voice: 2 })}${note(5, { voice: 2 })}${note(7, { voice: 2 })}`;
  expect(
    normalizeScore(score(twin)).tracks[0]!.notes.some((n) => n.techniques),
  ).toBe(false);
  expect(state(`${note(0)}${note(2)}${note(5)}${note(7)}`)).toEqual([
    [0, null],
    [2, null],
    [5, null],
    [7, null],
  ]);
});

it('압축 MusicXML(.mxl)도 실제 불러오기 입구에서 받아 컨테이너의 루트 파일에서 표기를 옮긴다', async () => {
  const body = `${note(0, { tech: start() })}${note(2, { tech: stop() })}${note(5)}${note(7)}`;
  const mxl = zipSync({
    'META-INF/container.xml': new TextEncoder().encode(
      '<container><rootfiles><rootfile full-path="music/score.xml"/></rootfiles></container>',
    ),
    'music/score.xml': xmlOf(body),
  });
  expect(localMediaKind('guitar.MXL')).toBe('score');
  const result = await importLocalMedia(
    'score',
    new File([mxl], 'guitar.mxl'),
    new AbortController().signal,
  );
  if (result.kind !== 'score') throw new Error('악보 세션 필요');
  expect(
    result.session.document.tracks[0]!.notes.map((n) => n.techniques ?? null),
  ).toEqual([['HAMMER'], null, null, null]);
});

/** MuseScore식 오선보(1)+TAB(2) 두 보표 파트. 같은 음이 양쪽에 있고 줄·프렛은 TAB 쪽에만 있습니다. */
function twoStaffScore(firstTech = '') {
  const pair = (fret: number, staff: number, tech = '') => {
    const [step, alter] = steps[fret]!;
    const fingering =
      staff === 2 || tech ? `<string>1</string><fret>${fret}</fret>` : '';
    return `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>4</octave></pitch><duration>2</duration><voice>${staff === 1 ? 1 : 5}</voice><type>quarter</type><staff>${staff}</staff><notations><technical>${fingering}${tech}</technical></notations></note>`;
  };
  const line = (staff: number) =>
    `${pair(0, staff, firstTech)}${pair(2, staff)}${pair(5, staff)}${pair(7, staff)}`;
  return importScore(
    new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Gtr</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef><clef number="2"><sign>TAB</sign><line>5</line></clef><staff-details number="2"><staff-lines>6</staff-lines>${tuning}</staff-details></attributes>${line(1)}<backup><duration>8</duration></backup>${line(2)}</measure></part></score-partwise>`,
    ),
  );
}

it('오선보+TAB 두 보표 파트에서는 줄이 있는 TAB 보표 음에만 옮긴다', () => {
  const document = normalizeScore(twoStaffScore(start()));
  expect(
    document.tracks[0]!.notes.map((n) => [
      n.stringIndex,
      n.techniques ?? n.judgementSupport ?? null,
    ]),
  ).toEqual([
    [1, ['HAMMER']],
    [1, null],
    [1, null],
    [1, null],
  ]);
});

it('복제 보표 제외: 새로 불러오면 채점 목표가 한 번씩이고, 예전 저장본(복제 음 포함)은 그대로 열린다', () => {
  const score = twoStaffScore();
  const document = normalizeScore(score);
  // 오선보 쪽 복제 음 없이 TAB 음 4개와 TAB 튜닝만 남습니다.
  expect(document.tracks[0]!.tuningMidi).toEqual([64, 59, 55, 50, 45, 40]);
  expect(
    buildPracticeTargets(document, 0, 3000, null).map((t) => t.pitchMidi),
  ).toEqual([64, 66, 69, 71]);
  // 이전 규칙으로 저장된 문서: 줄 없는 복제 음 4개가 함께 들어 있습니다.
  const track = document.tracks[0]!;
  const legacy = {
    ...document,
    tracks: [
      {
        ...track,
        tuningMidi: [],
        notes: [
          ...track.notes,
          ...track.notes.map((n) => {
            const copy = { ...n, id: `${n.id}-staff1` };
            delete copy.stringIndex;
            delete copy.fret;
            return copy;
          }),
        ],
      },
    ],
  };
  const restored = restoreJudgementSupport(legacy, score);
  expect(restored.tracks[0]!.notes).toHaveLength(8);
  expect(restored.tracks[0]!.tuningMidi).toEqual([]);
});

it('score-timewise(마디 안에 파트)도 같은 위치의 음에 표기를 옮긴다', () => {
  const measure = (number: number, body: string, attributes = '') =>
    `<measure number="${number}"><part id="P1">${attributes}${body}</part></measure>`;
  const attributes = `<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>6</staff-lines>${tuning}</staff-details></attributes>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-timewise version="3.1"><part-list><score-part id="P1"><part-name>Gtr</part-name></score-part></part-list>${measure(1, `${note(0)}${note(2)}${note(5)}${note(7)}`, attributes)}${measure(2, `${note(5, { tech: start() })}${note(7, { tech: stop() })}${note(12, { tech: '<harmonic><natural/></harmonic>' })}${note(0)}`)}</score-timewise>`;
  const notes = normalizeScore(importScore(new TextEncoder().encode(xml)))
    .tracks[0]!.notes;
  expect(
    notes.map((n) => [n.measureIndex, n.fret, n.techniques ?? null]),
  ).toEqual([
    [0, 0, null],
    [0, 2, null],
    [0, 5, null],
    [0, 7, null],
    [1, 5, ['HAMMER']],
    [1, 7, null],
    [1, 12, ['HARMONIC_NATURAL']],
    [1, 0, null],
  ]);
});

it('두 보표 악보의 편집 시작은 줄 있는 보표의 튜닝을 유지한다', () => {
  const score = twoStaffScore();
  const document = normalizeScore(score);
  // 저장본 정규화 전(구형) 문서처럼 편집 시작 경로를 탑니다.
  const prepared = prepareEditingDocument({
    score,
    document: { ...document, renderSource: undefined },
  } as unknown as ScoreSession);
  expect(prepared.tracks[0]!.tuningMidi).toEqual([64, 59, 55, 50, 45, 40]);
  expect(() => validateEditable(prepared)).not.toThrow();
});

it('마디 중간에 divisions가 바뀌어도 해머온을 같은 위치의 음에 붙이고 도착 음을 바르게 뺀다', () => {
  // 앞 두 음은 divisions 2(4분 = 2), 뒤 두 음은 divisions 4(4분 = 4)로 적혀 있습니다.
  const quarter = (fret: number, duration: number, tech = '') => {
    const [step, alter, octave] = steps[fret]!;
    return `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice><type>quarter</type><notations><technical><string>1</string><fret>${fret}</fret>${tech}</technical></notations></note>`;
  };
  const body = `${quarter(0, 2)}${quarter(0, 2)}<attributes><divisions>4</divisions></attributes>${quarter(0, 4, start())}${quarter(2, 4, stop())}`;
  const document = normalizeScore(score(body));
  expect(
    document.tracks[0]!.notes.map((n) => [n.startTick, n.techniques ?? null]),
  ).toEqual([
    [0, null],
    [960, null],
    [1920, ['HAMMER']],
    [2880, null],
  ]);
  expect(
    buildPracticeTargets(document, 0, 3000, null).map(
      (n) => n.unsupported ?? false,
    ),
  ).toEqual([false, false, false, true]);
});

it('예전에 하모닉 표기 없이 저장된 MusicXML 음은 저장 음정 그대로 열리고 채점에서만 빠진다', () => {
  // 3프렛 자연 하모닉은 AlphaTex로 다시 만들 수 없어 소리 음정·미지원으로 정규화됩니다.
  const source = score(
    `${note(3, { tech: '<harmonic><natural/></harmonic>' })}${note(5)}${note(7)}${note(0)}`,
  );
  const document = normalizeScore(source);
  expect(document.tracks[0]!.notes[0]!.judgementSupport).toBe('UNSUPPORTED');
  // 하모닉 해석 전 저장본: 3프렛 일반 음정(G4=67), 제외 표시 없음.
  const legacy = structuredClone(document);
  const first = legacy.tracks[0]!.notes[0]!;
  first.pitchMidi = 67;
  delete first.judgementSupport;
  const restored = restoreJudgementSupport(legacy, source);
  expect(
    restored.tracks[0]!.notes.map((n) => [
      n.pitchMidi,
      n.judgementSupport ?? null,
    ]),
  ).toEqual([
    [67, 'UNSUPPORTED'],
    [69, null],
    [71, null],
    [64, null],
  ]);
});

it('UTF-16(BOM) MusicXML도 UTF-8과 같은 주법·채점 제외로 읽는다(평문·.mxl)', () => {
  const body = `${note(0, { tech: start() })}${note(2, { tech: stop() })}${note(3, { tech: '<harmonic><natural/></harmonic>' })}${note(7)}`;
  const utf8 = xmlOf(body);
  const utf16 = (big: boolean) => {
    const text = new TextDecoder().decode(utf8);
    const out = new Uint8Array(2 + text.length * 2);
    out.set(big ? [0xfe, 0xff] : [0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      out[2 + i * 2 + (big ? 1 : 0)] = code & 0xff;
      out[2 + i * 2 + (big ? 0 : 1)] = code >> 8;
    }
    return out;
  };
  const mxl = (root: Uint8Array, container: Uint8Array) =>
    zipSync({ 'META-INF/container.xml': container, 'music/score.xml': root });
  const containerText =
    '<container><rootfiles><rootfile full-path="music/score.xml"/></rootfiles></container>';
  const shape = (bytes: Uint8Array) =>
    normalizeScore(importScore(bytes)).tracks[0]!.notes.map((n) => [
      n.pitchMidi,
      n.judgementSupport ?? n.techniques ?? null,
    ]);
  const expected = shape(utf8);
  expect(expected[0]).toEqual([64, ['HAMMER']]);
  expect(expected[2]![1]).toBe('UNSUPPORTED');
  for (const big of [false, true]) {
    expect(shape(utf16(big))).toEqual(expected);
    // container.xml도 UTF-16으로 둡니다.
    const container = new TextEncoder().encode(containerText);
    const wide = new Uint8Array(2 + container.length * 2);
    wide.set(big ? [0xfe, 0xff] : [0xff, 0xfe]);
    container.forEach((c, i) => (wide[2 + i * 2 + (big ? 1 : 0)] = c));
    expect(shape(mxl(utf16(big), wide))).toEqual(expected);
  }
});
