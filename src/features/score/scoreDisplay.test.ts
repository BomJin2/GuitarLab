import { importer, model, rendering, Settings } from '@coderline/alphatab';
import { expect, it } from 'vitest';
import xml from '../../../public/fixtures/standard.musicxml?raw';
import dual from '../../../public/fixtures/dual-guitar.musicxml?raw';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
} from './alphaTabAdapter';
import { alphaTabDisplay, createDisplayScore } from './scoreDisplay';
import { renderedNoteId } from './scoreNoteSelection';
import { scoreCapacityFixture } from '../../test/scoreCapacityFixture';
import { renderNormalized } from './normalizedNotation';

it('128트랙 중 마지막 트랙만 복사하고 트랙별 표기·원래 객체/시간/문서를 보존한다', () => {
  const capacity = scoreCapacityFixture(128);
  const document = {
    ...capacity,
    timeSignatures: capacity.timeSignatures.slice(0, 4),
  };
  const { score } = renderNormalized(document);
  score.title = '표시 원본 제목';
  score.artist = '자체 연주자';
  score.tempo = 95;
  score.stylesheet.perTrackDisplayTuning = new Map([
    [0, true],
    [127, false],
  ]);
  score.stylesheet.perTrackChordDiagramsOnTop = new Map([[127, true]]);
  score.stylesheet.perTrackMultiBarRest = new Set([127]);
  const before = model.JsonConverter.scoreToJson(score);
  const display = createDisplayScore(score, 127, 'tab');
  expect(display.score.tracks).toHaveLength(1);
  expect([
    display.score.title,
    display.score.artist,
    display.score.tempo,
  ]).toEqual([score.title, score.artist, score.tempo]);
  expect(display.score.tracks[0]?.name).toBe(score.tracks[127]?.name);
  expect(score.tracks[127]?.score).toBe(score);
  expect(score.tracks[127]?.index).toBe(127);
  expect(display.score.tracks[0]?.staves[0]?.bars).toHaveLength(4);
  expect([...(display.score.stylesheet.perTrackDisplayTuning ?? [])]).toEqual([
    [0, false],
  ]);
  expect([
    ...(display.score.stylesheet.perTrackChordDiagramsOnTop ?? []),
  ]).toEqual([[0, true]]);
  expect([...(display.score.stylesheet.perTrackMultiBarRest ?? [])]).toEqual([
    0,
  ]);
  expect(display.renderTrackIndex).toBe(0);
  expect(display.notes.size).toBe(document.tracks[127]?.notes.length);
  for (const original of display.notes.values())
    expect(original.beat.voice.bar.staff.track.index).toBe(127);
  expect(
    buildPlaybackLookup(display.score).masterBars.map((bar) => bar.start),
  ).toEqual(buildPlaybackLookup(score).masterBars.map((bar) => bar.start));
  expect(model.JsonConverter.scoreToJson(score)).toBe(before);
  const absent = createDisplayScore(score, 1, 'score');
  expect(absent.score.stylesheet.perTrackDisplayTuning).toBeNull();
  expect(absent.score.stylesheet.perTrackChordDiagramsOnTop).toBeNull();
  expect([...(absent.score.stylesheet.perTrackMultiBarRest ?? [])]).toEqual([]);
});

it.each([xml, dual])(
  'TAB 전용 원본은 불변이고 표시 복사본의 음표/박자는 원래 ID와 연결한다',
  (text) => {
    const originalBytes = new TextEncoder().encode(text);
    const score = importScore(originalBytes);
    const playbackLookup = buildPlaybackLookup(score);
    const document = normalizeScore(score, playbackLookup);
    const raw = model.JsonConverter.scoreToJson(score);
    const documentBefore = JSON.stringify(document);
    for (const [index] of score.tracks.entries()) {
      for (const notation of ['tab', 'score'] as const) {
        const display = createDisplayScore(score, index, notation);
        expect(display.score).not.toBe(score);
        const session = {
          score,
          document,
          playbackLookup,
          originalBytes,
          activeTrackIndex: index,
        };
        expect(display.score.tracks).toHaveLength(1);
        expect(display.renderTrackIndex).toBe(0);
        for (const staff of display.score.tracks[0]!.staves) {
          expect(staff.showStandardNotation).toBe(notation === 'score');
          expect(staff.showTablature).toBe(notation === 'tab');
          for (const bar of staff.bars)
            for (const voice of bar.voices)
              for (const beat of voice.beats) {
                for (const note of beat.notes) {
                  const original = display.notes.get(note);
                  if (!original) throw new Error('원래 음표 연결 필요');
                  expect(original).not.toBe(note);
                  expect(display.beats.get(original.beat)).toBe(beat);
                  expect(renderedNoteId(session, original, 0)).not.toBeNull();
                }
              }
        }
      }
    }
    expect(model.JsonConverter.scoreToJson(score)).toBe(raw);
    expect(JSON.stringify(document)).toBe(documentBefore);
  },
);

it('쉼표·화음·반복의 직접 객체 관계와 원본 경계를 유지한다', () => {
  const source = importer.ScoreLoader.loadAlphaTex(
    '. 0.1.4 r.4 (3.1 5.2).4 | 7.1.1',
  );
  source.masterBars[0]!.isRepeatStart = true;
  source.masterBars[0]!.repeatCount = 2;
  source.rebuildRepeatGroups();
  const lookup = buildPlaybackLookup(source);
  const result = createDisplayScore(source, 0, 'score');
  expect(
    buildPlaybackLookup(result.score).masterBars.map((entry) => entry.start),
  ).toEqual(lookup.masterBars.map((entry) => entry.start));
  const beats = source.tracks[0]!.staves[0]!.bars.flatMap((bar) =>
    bar.voices.flatMap((voice) => voice.beats),
  );
  for (const beat of beats) {
    const copy = result.beats.get(beat);
    expect(copy !== beat).toBe(true);
    expect(copy?.notes.length).toBe(beat.notes.length);
    for (const [i, note] of beat.notes.entries())
      expect(result.notes.get(copy!.notes[i]!) === note).toBe(true);
  }
  expect(() => createDisplayScore(source, -1, 'tab')).toThrow('악보 표시 트랙');
});

// 실제 alphaTab SVG 렌더러로 그려 주법 표시가 빠지지 않는지 봅니다(docs/12 주법 편집 v1).
function svgOf(notation: 'tab' | 'score') {
  const source = importer.ScoreLoader.loadAlphaTex(
    '. 0.1{pm}.4 r.4 3.1{v}.4 5.1.4 | 5.1.4 {tt} 7.1.2 r.4',
  );
  const { score } = createDisplayScore(source, 0, notation);
  const settings = new Settings();
  settings.core.engine = 'svg';
  settings.core.enableLazyLoading = false;
  settings.display.staveProfile = alphaTabDisplay({
    notation,
    layout: 'page',
    scale: 1,
  }).staveProfile;
  const renderer = new rendering.ScoreRenderer(settings);
  renderer.width = 1200;
  let svg = '';
  renderer.partialRenderFinished.on((r) => {
    svg += String(r.renderResult ?? '');
  });
  renderer.renderScore(score, [0]);
  return svg;
}

it('TAB 보기에서도 팜뮤트(P.M.)·태핑(T)과 쉼표·박자표를 그린다', () => {
  const svg = svgOf('tab');
  expect(svg).toContain('P.M.');
  expect(svg).toContain('>T<');
  // 쉼표(U+E4E5)와 박자표 숫자(U+E084)도 기존 TAB 보기처럼 남습니다.
  expect(svg).toContain('&#58597;');
  expect(svg).toContain('&#57476;');
});

const twoStaffXml = (tabFrets: number[]) => {
  const tuning = [
    ['E', 4],
    ['B', 3],
    ['G', 3],
    ['D', 3],
    ['A', 2],
    ['E', 2],
  ]
    .map(
      ([step, octave], i) =>
        `<staff-tuning line="${6 - i}"><tuning-step>${step}</tuning-step><tuning-octave>${octave}</tuning-octave></staff-tuning>`,
    )
    .join('');
  const steps = ['E', 'F', 'G', 'A'];
  const notation = [0, 1, 3, 5]
    .map(
      (_, i) =>
        `<note><pitch><step>${steps[i]}</step>${steps[i] === 'F' ? '' : ''}<octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`,
    )
    .join('');
  const tabSteps = ['E', 'F', 'G', 'A'];
  const tab = tabFrets
    .map(
      (fret, i) =>
        `<note><pitch><step>${tabSteps[i]}</step><octave>4</octave></pitch><duration>1</duration><voice>5</voice><type>quarter</type><staff>2</staff><notations><technical><string>1</string><fret>${fret}</fret></technical></notations></note>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Gtr</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>TAB</sign><line>5</line></clef><staff-details number="2"><staff-lines>6</staff-lines>${tuning}</staff-details></attributes>${notation}<backup><duration>4</duration></backup>${tab}</measure></part></score-partwise>`;
};
it('같은 선율의 오선보+TAB 악보는 오선보 보기에서 오선보를 한 번만 그리고, 다른 내용의 보표는 그대로 둔다(2026-11-08 리뷰)', () => {
  const same = importScore(new TextEncoder().encode(twoStaffXml([0, 1, 3, 5])));
  const staves = same.tracks[0]!.staves;
  expect(staves.map((s) => s.tuning.length)).toEqual([0, 6]);
  const score = createDisplayScore(same, 0, 'score').score.tracks[0]!.staves;
  expect(score.filter((s) => s.showStandardNotation)).toHaveLength(1);
  const tab = createDisplayScore(same, 0, 'tab').score.tracks[0]!.staves;
  expect(tab.map((s) => [s.showStandardNotation, s.showTablature])).toEqual([
    [false, false],
    [false, true],
  ]);
  // TAB 쪽 음이 다르면(독립 보표) 두 보표 모두 오선보로 그립니다.
  const different = importScore(
    new TextEncoder().encode(twoStaffXml([0, 1, 3, 7])),
  );
  const both = createDisplayScore(different, 0, 'score').score.tracks[0]!
    .staves;
  expect(both.filter((s) => s.showStandardNotation)).toHaveLength(2);
});
