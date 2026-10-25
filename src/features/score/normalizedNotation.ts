import type { ScoreDocument, NoteEvent } from '../../entities/score';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import type { ScoreSession } from './scoreSession';
import { decodeScoreJson, isScoreJson } from './scoreJson';
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
      const tuning = session.score.tracks[index]?.staves[0]?.tuning;
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
function notation(duration: number, note?: NoteEvent) {
  const type = noteDurations.find((d) => d.ticks === duration);
  if (!type) throw unsupported();
  return `<note>${note ? `<pitch>${pitch(note.pitchMidi)}</pitch>` : '<rest/>'}<duration>${duration}</duration><voice>1</voice><type>${type.type}</type>${type.dotted ? '<dot/>' : ''}${note ? `<notations><technical><string>${note.stringIndex}</string><fret>${note.fret}</fret></technical></notations>` : ''}</note>`;
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
      ]),
  );
}
export function renderNormalized(document: ScoreDocument) {
  const score = importScore(
    new TextEncoder().encode(toNormalizedMusicXml(document)),
  );
  const playbackLookup = buildPlaybackLookup(score);
  const roundTrip = normalizeScore(score, playbackLookup);
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
      '편집본 렌더 왕복에서 음정·시간·운지·박자·템포가 달라 적용하지 않았습니다.',
    );
  return { score, playbackLookup };
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
