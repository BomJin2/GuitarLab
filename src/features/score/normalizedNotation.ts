import type { ScoreDocument, NoteEvent, Technique } from '../../entities/score';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import type { ScoreSession } from './scoreSession';
import { decodeScoreJson, isScoreJson } from './scoreJson';
import { exporter, importer, model } from '@coderline/alphatab';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
} from './alphaTabAdapter';

export const noteDurations = [
  { ticks: 5760, type: 'whole', dotted: true, label: '점온음표' },
  { ticks: 3840, type: 'whole', dotted: false, label: '온음표' },
  { ticks: 2880, type: 'half', dotted: true, label: '점2분음표' },
  { ticks: 1920, type: 'half', dotted: false, label: '2분음표' },
  { ticks: 1440, type: 'quarter', dotted: true, label: '점4분음표' },
  { ticks: 960, type: 'quarter', dotted: false, label: '4분음표' },
  { ticks: 720, type: 'eighth', dotted: true, label: '점8분음표' },
  { ticks: 480, type: 'eighth', dotted: false, label: '8분음표' },
  { ticks: 360, type: '16th', dotted: true, label: '점16분음표' },
  { ticks: 240, type: '16th', dotted: false, label: '16분음표' },
  { ticks: 180, type: '32nd', dotted: true, label: '점32분음표' },
  { ticks: 120, type: '32nd', dotted: false, label: '32분음표' },
  { ticks: 60, type: '64th', dotted: false, label: '64분음표' },
];
export type EditorBar = {
  start: number;
  end: number;
  numerator: number;
  denominator: number;
};
const unsupported = () =>
  new Error(
    '현재 편집은 PPQ960·6줄 운지가 있는 기본 단성 악보만 지원합니다. 미지원 주법·화음·타이·중첩·마디 중간 템포·특수 음가는 원본 보기/재생을 사용하세요.',
  );
export const scoreXmlLimitMessage =
  '편집본 MusicXML이 8MiB를 초과합니다. 트랙 또는 마디 수를 줄이세요. 기존 악보와 원본은 유지했습니다.';

export function prepareEditingDocument(session: ScoreSession): ScoreDocument {
  if (session.document.renderSource === 'NORMALIZED') return session.document;
  return {
    ...session.document,
    tracks: session.document.tracks.map((track, index) => {
      // normalizeScore와 같이 줄 있는 첫 보표의 튜닝(두 보표 악보의 오선보 쪽은 줄이 없음)
      const staves = session.score.tracks[index]?.staves ?? [];
      const tuning = (staves.find((s) => s.tuning.length > 0) ?? staves[0])
        ?.tuning;
      if (!tuning) throw unsupported();
      return { ...track, tuningMidi: [...tuning] };
    }),
  };
}

export function editorBars(document: ScoreDocument): EditorBar[] {
  decodeScoreDocument(document);
  if (document.ppq !== 960) throw unsupported();
  const last = document.timeSignatures.at(-1);
  if (!last) throw unsupported();
  const end = Math.max(
    last.tick + (3840 * last.numerator) / last.denominator,
    ...document.tracks.map((t) =>
      t.notes.reduce((n, v) => Math.max(n, v.startTick + v.durationTicks), 0),
    ),
  );
  const bars: EditorBar[] = [];
  let signatureIndex = 0;
  for (let start = 0; start < end; ) {
    if (bars.length >= 256)
      throw new Error('첫 편집 버전은256마디/전체2,000음 이하를 지원합니다.');
    while (
      (document.timeSignatures[signatureIndex + 1]?.tick ?? Infinity) <= start
    )
      signatureIndex++;
    const signature = document.timeSignatures[signatureIndex];
    if (!signature) throw unsupported();
    const next = start + (3840 * signature.numerator) / signature.denominator;
    if (
      !Number.isSafeInteger(next) ||
      next % 60 !== 0 ||
      (document.timeSignatures[signatureIndex + 1]?.tick ?? Infinity) < next
    )
      throw unsupported();
    bars.push({
      start,
      end: next,
      numerator: signature.numerator,
      denominator: signature.denominator,
    });
    start = next;
  }
  return bars;
}
export function validateEditable(document: ScoreDocument): EditorBar[] {
  const bars = editorBars(document);
  if (document.tracks.reduce((n, t) => n + t.notes.length, 0) > 2000)
    throw new Error('첫 편집 버전은256마디/전체2,000음 이하를 지원합니다.');
  if (document.tempoMap.some((t) => !bars.some((b) => b.start === t.tick)))
    throw unsupported();
  for (const track of document.tracks) {
    if (track.tuningMidi.length !== 6) throw unsupported();
    let end = 0;
    for (const note of [...track.notes].sort(
      (a, b) => a.startTick - b.startTick,
    )) {
      const bar = bars.find(
        (b) => b.start <= note.startTick && note.startTick < b.end,
      );
      if (
        !bar ||
        note.attack === false ||
        note.judgementSupport === 'UNSUPPORTED' ||
        note.startTick % 60 !== 0 ||
        !noteDurations.some((d) => d.ticks === note.durationTicks) ||
        note.startTick < end ||
        note.startTick + note.durationTicks > bar.end ||
        note.stringIndex === undefined ||
        note.fret === undefined ||
        note.pitchMidi !==
          (track.tuningMidi[note.stringIndex - 1] ?? -100) + note.fret
      )
        throw unsupported();
      end = note.startTick + note.durationTicks;
    }
  }
  return bars;
}
const escapeXml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c] ?? c,
  );
function pitch(midi: number, prefix = '') {
  const steps = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const sharp = [1, 3, 6, 8, 10].includes(midi % 12);
  return `<${prefix}step>${steps[midi % 12]}</${prefix}step>${sharp ? `<${prefix}alter>1</${prefix}alter>` : ''}<${prefix}octave>${Math.floor(midi / 12) - 1}</${prefix}octave>`;
}
/** docs/12 "주법 편집 v1": alphaTab이 다시 읽을 수 있는 MusicXML 표기(실측)로 씁니다. */
function techniqueXml(note: NoteEvent) {
  const has = (t: Technique) => note.techniques?.includes(t) ?? false;
  const notehead =
    has('DEAD') || has('GHOST')
      ? `<notehead${has('GHOST') ? ' parentheses="yes"' : ''}>${has('DEAD') ? 'x' : 'normal'}</notehead>`
      : '';
  const technical = `${has('BEND') ? `<bend><bend-alter>${note.bendSemitones}</bend-alter></bend>` : ''}${has('TAP') ? '<tap/>' : ''}`;
  const articulations = has('STACCATO')
    ? '<articulations><staccato/></articulations>'
    : '';
  const ornaments = has('VIBRATO')
    ? '<ornaments><wavy-line type="start"/><wavy-line type="stop"/></ornaments>'
    : '';
  const play = has('PALM_MUTE') ? '<play><mute>palm</mute></play>' : '';
  return { notehead, technical, rest: articulations + ornaments, play };
}
function notation(duration: number, note?: NoteEvent) {
  const type = noteDurations.find((d) => d.ticks === duration);
  if (!type) throw unsupported();
  const t = note ? techniqueXml(note) : null;
  return `<note>${note ? `<pitch>${pitch(note.pitchMidi)}</pitch>` : '<rest/>'}<duration>${duration}</duration><voice>1</voice><type>${type.type}</type>${type.dotted ? '<dot/>' : ''}${t?.notehead ?? ''}${note ? `<notations><technical><string>${note.stringIndex}</string><fret>${note.fret}</fret>${t?.technical ?? ''}</technical>${t?.rest ?? ''}</notations>${t?.play ?? ''}` : ''}</note>`;
}
function rests(duration: number) {
  let xml = '';
  for (const d of noteDurations) {
    while (duration >= d.ticks) {
      xml += notation(d.ticks);
      duration -= d.ticks;
    }
  }
  if (duration !== 0) throw unsupported();
  return xml;
}
export function toNormalizedMusicXml(document: ScoreDocument): string {
  const bars = validateEditable(document);
  const fragments: string[] = [];
  const encoder = new TextEncoder();
  let bytes = 0;
  function append(xml: string) {
    bytes += encoder.encode(xml).length;
    if (bytes > 8 * 1024 * 1024) throw new Error('SCORE_XML_LIMIT');
    fragments.push(xml);
  }
  append(
    `<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>${escapeXml(document.title)}</work-title></work><part-list>${document.tracks.map((t, i) => `<score-part id="P${i + 1}"><part-name>${escapeXml(t.name)}</part-name><score-instrument id="I${i + 1}"><instrument-name>Guitar</instrument-name></score-instrument><midi-instrument id="I${i + 1}"><midi-channel>${(i % 8) + 1}</midi-channel><midi-program>25</midi-program></midi-instrument></score-part>`).join('')}</part-list>`,
  );
  document.tracks.forEach((track, index) => {
    append(`<part id="P${index + 1}">`);
    const notes = [...track.notes].sort((a, b) => a.startTick - b.startTick);
    let noteIndex = 0;
    bars.forEach((bar, barIndex) => {
      let cursor = bar.start;
      let body = '';
      while ((notes[noteIndex]?.startTick ?? Infinity) < bar.end) {
        const note = notes[noteIndex++];
        if (!note) throw unsupported();
        body +=
          rests(note.startTick - cursor) + notation(note.durationTicks, note);
        cursor = note.startTick + note.durationTicks;
      }
      const tempo = document.tempoMap.find((t) => t.tick === bar.start);
      append(
        `<measure number="${barIndex + 1}"><attributes><divisions>960</divisions><time><beats>${bar.numerator}</beats><beat-type>${bar.denominator}</beat-type></time>${
          barIndex === 0
            ? `<clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>6</staff-lines>${[
                ...track.tuningMidi,
              ]
                .reverse()
                .map(
                  (m, i) =>
                    `<staff-tuning line="${i + 1}">${pitch(m, 'tuning-')}</staff-tuning>`,
                )
                .join('')}</staff-details>`
            : ''
        }</attributes>${tempo ? `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo.bpm}</per-minute></metronome></direction-type><sound tempo="${tempo.bpm}"/></direction>` : ''}${body}${rests(bar.end - cursor)}</measure>`,
      );
    });
    append('</part>');
  });
  append('</score-partwise>');
  return fragments.join('');
}
function events(document: ScoreDocument) {
  return document.tracks.map((t) =>
    [...t.notes]
      .sort((a, b) => a.startTick - b.startTick)
      .map((n) => [
        n.startTick,
        n.durationTicks,
        n.pitchMidi,
        n.stringIndex,
        n.fret,
        // 주법을 잃어버린 왕복은 적용하지 않습니다(docs/12 주법 편집 v1).
        n.techniques ?? [],
        n.bendSemitones ?? null,
      ]),
  );
}
// docs/12 "주법 편집 v2": 편집 그리기는 alphaTab이 기타 주법을 가장 온전히 읽는 AlphaTex로 합니다.
const texDurations: Record<string, number> = {
  whole: 1,
  half: 2,
  quarter: 4,
  eighth: 8,
  '16th': 16,
  '32nd': 32,
  '64th': 64,
};
const texNames = [
  'c',
  'c#',
  'd',
  'd#',
  'e',
  'f',
  'f#',
  'g',
  'g#',
  'a',
  'a#',
  'b',
];
const texString = (text: string) =>
  `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const texPitch = (midi: number) =>
  `${texNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
const noteEffect: Partial<Record<Technique, string>> = {
  PALM_MUTE: 'pm',
  DEAD: 'x',
  GHOST: 'g',
  STACCATO: 'st',
  VIBRATO: 'v',
  HAMMER: 'h',
  SLIDE_LEGATO: 'sl',
  SLIDE_SHIFT: 'ss',
  HARMONIC_NATURAL: 'nh',
  LET_RING: 'lr',
};
function texBeat(duration: number, note?: NoteEvent) {
  const type = noteDurations.find((d) => d.ticks === duration);
  if (!type) throw unsupported();
  const length = texDurations[type.type];
  const effects = (note?.techniques ?? []).flatMap((t) =>
    t === 'BEND'
      ? [`b (0 ${(note?.bendSemitones ?? 1) * 2})`]
      : noteEffect[t]
        ? [noteEffect[t]]
        : [],
  );
  const beat = [
    ...(type.dotted ? ['d'] : []),
    ...(note?.techniques?.includes('TAP') ? ['tt'] : []),
  ];
  const head = note
    ? `${note.fret}.${note.stringIndex}${effects.length ? `{${effects.join(' ')}}` : ''}`
    : 'r';
  return `${head}.${length}${beat.length ? `{${beat.join(' ')}}` : ''} `;
}
function texRests(duration: number) {
  let text = '';
  for (const d of noteDurations) {
    while (duration >= d.ticks) {
      text += texBeat(d.ticks);
      duration -= d.ticks;
    }
  }
  if (duration !== 0) throw unsupported();
  return text;
}
export function toNormalizedAlphaTex(document: ScoreDocument): string {
  const bars = validateEditable(document);
  let text = `\\title ${texString(document.title)} .\n`;
  for (const track of document.tracks) {
    text += `\\track ${texString(track.name)} \\staff {tabs} \\tuning ${track.tuningMidi.map(texPitch).join(' ')}\n`;
    const notes = [...track.notes].sort((a, b) => a.startTick - b.startTick);
    let noteIndex = 0;
    bars.forEach((bar, barIndex) => {
      const previous = bars[barIndex - 1];
      const tempo = document.tempoMap.find((t) => t.tick === bar.start);
      // \tempo는 뒤의 숫자를 위치 값으로 더 읽으므로, 템포를 쓰면 바로 뒤에 \ts를 둡니다.
      const meta =
        (tempo ? `\\tempo ${tempo.bpm} ` : '') +
        (tempo ||
        !previous ||
        previous.numerator !== bar.numerator ||
        previous.denominator !== bar.denominator
          ? `\\ts ${bar.numerator} ${bar.denominator} `
          : '');
      let cursor = bar.start;
      let body = '';
      while ((notes[noteIndex]?.startTick ?? Infinity) < bar.end) {
        const note = notes[noteIndex++];
        if (!note) throw unsupported();
        body +=
          texRests(note.startTick - cursor) + texBeat(note.durationTicks, note);
        cursor = note.startTick + note.durationTicks;
      }
      text += `${meta}${body}${texRests(bar.end - cursor)}${barIndex < bars.length - 1 ? '| ' : '\n'}`;
    });
  }
  if (new TextEncoder().encode(text).length > 8 * 1024 * 1024)
    throw new Error('SCORE_XML_LIMIT');
  return text;
}
/** AlphaTex의 데드 표시(`x`)는 프렛을 0으로 바꾸므로, 직접 만든 순서대로 원래 프렛을 되돌립니다. */
function restoreDeadFrets(score: model.Score, document: ScoreDocument) {
  document.tracks.forEach((track, index) => {
    const notes = [...track.notes].sort((a, b) => a.startTick - b.startTick);
    const rendered = (score.tracks[index]?.staves[0]?.bars ?? []).flatMap(
      (bar) =>
        (bar.voices[0]?.beats ?? []).flatMap((beat) =>
          beat.isRest ? [] : beat.notes,
        ),
    );
    // 개수가 다르면 건드리지 않고 왕복 비교가 거부하게 둡니다.
    if (rendered.length !== notes.length) return;
    notes.forEach((note, i) => {
      const target = rendered[i];
      if (
        target &&
        note.techniques?.includes('DEAD') &&
        note.fret !== undefined
      )
        target.fret = note.fret;
    });
  });
}
export function renderNormalized(document: ScoreDocument) {
  // 편집본은 언제나 MusicXML로도 내보낼 수 있어야 하므로 그 용량 한도(8MiB)를 먼저 확인합니다.
  toNormalizedMusicXml(document);
  const score = importer.ScoreLoader.loadAlphaTex(
    toNormalizedAlphaTex(document),
  );
  restoreDeadFrets(score, document);
  const playbackLookup = buildPlaybackLookup(score);
  checkRoundTrip(normalizeScore(score, playbackLookup), document);
  return { score, playbackLookup };
}
function checkRoundTrip(roundTrip: ScoreDocument, document: ScoreDocument) {
  const signatures = editorBars(document).map((b) => ({
    tick: b.start,
    numerator: b.numerator,
    denominator: b.denominator,
  }));
  const tempos = document.tempoMap
    .filter((t, index, all) => index === 0 || t.bpm !== all[index - 1]?.bpm)
    .map((t) => [t.tick, t.bpm]);
  if (
    JSON.stringify(events(roundTrip)) !== JSON.stringify(events(document)) ||
    JSON.stringify(roundTrip.tracks.map((t) => t.tuningMidi)) !==
      JSON.stringify(document.tracks.map((t) => t.tuningMidi)) ||
    JSON.stringify(roundTrip.timeSignatures) !== JSON.stringify(signatures) ||
    JSON.stringify(roundTrip.tempoMap.map((t) => [t.tick, t.bpm])) !==
      JSON.stringify(tempos)
  )
    throw new Error(
      '편집본 렌더 왕복에서 음정·시간·운지·주법·박자·템포가 달라 적용하지 않았습니다.',
    );
}
/** docs/12 주법 편집 v2: 편집본을 그린 악보를 GP7로 쓰고, 다시 읽어 같을 때만 내보냅니다. */
export function toNormalizedGp7(document: ScoreDocument): Uint8Array {
  // 스윙 소리 시각(playbackTick)은 편집 그리기·GP7에 담기지 않아, 손실 없이 내보낼 수 없으면 거부합니다.
  if (
    document.tracks.some((t) =>
      t.notes.some((n) => n.playbackTick !== undefined),
    )
  )
    throw new Error('SCORE_GP7_SWING');
  const bytes = new exporter.Gp7Exporter().export(
    renderNormalized(document).score,
  );
  if (bytes.length > 8 * 1024 * 1024) throw new Error('SCORE_XML_LIMIT');
  checkRoundTrip(normalizeScore(importScore(bytes)), document);
  return bytes;
}
export function renderStoredScore(
  document: ScoreDocument,
  original: Uint8Array,
) {
  if (document.renderSource === 'NORMALIZED') return renderNormalized(document);
  return renderOriginalScore(original);
}
export function renderOriginalScore(original: Uint8Array) {
  if (isScoreJson(original)) return renderNormalized(decodeScoreJson(original));
  const score = importScore(original);
  return { score, playbackLookup: buildPlaybackLookup(score) };
}
