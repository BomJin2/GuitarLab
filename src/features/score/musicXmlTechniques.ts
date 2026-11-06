import { model } from '@coderline/alphatab';
import { unzipSync } from 'fflate';

// docs/12 주법 편집 v2 "MusicXML 보강": alphaTab 1.6.1이 읽지 않는 해머온·풀오프·하모닉 표기를 옮깁니다.
const children = (element: Element | undefined, name: string) =>
  element ? [...element.children].filter((c) => c.tagName === name) : [];
const child = (element: Element | undefined, name: string) =>
  children(element, name)[0];
const number = (element: Element | undefined) =>
  element ? Number(element.textContent?.trim()) : NaN;

/** 파트(트랙)마다 마디 순서대로의 음 묶음. timewise는 마디 안의 파트를 part-list 순서로 모읍니다(빠진 마디는 undefined). */
function partMeasures(root: Element): (Element | undefined)[][] {
  if (root.tagName === 'score-partwise')
    return children(root, 'part').map((part) => children(part, 'measure'));
  if (root.tagName !== 'score-timewise') return [];
  const measures = children(root, 'measure');
  return children(child(root, 'part-list'), 'score-part').map((part) =>
    measures.map((measure) =>
      children(measure, 'part').find(
        (p) => p.getAttribute('id') === part.getAttribute('id'),
      ),
    ),
  );
}

/** alphaTab 1.6.1 IOHelper.toString과 같은 규칙: UTF-16 BOM이면 그 인코딩, 아니면 UTF-8(BOM은 TextDecoder가 뗍니다). */
function decodeXml(bytes: Uint8Array): string {
  const label =
    bytes[0] === 0xfe && bytes[1] === 0xff
      ? 'utf-16be'
      : bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : 'utf-8';
  return new TextDecoder(label).decode(bytes);
}

/** 평문·압축 MusicXML(partwise·timewise)에서 짝이 하나뿐인 음에만 표기를 옮깁니다. 짝을 못 찾으면 그대로 둡니다. */
export function applyMusicXmlTechniques(
  score: model.Score,
  bytes: Uint8Array,
): void {
  const plain = bytes[0] === 0x50 ? mxlRoot(bytes) : bytes;
  if (!plain) return;
  const text = decodeXml(plain);
  if (
    !/<score-(partwise|timewise)\b/.test(text) ||
    !/<(hammer-on|pull-off|harmonic)\b/.test(text)
  )
    return;
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) return;
  partMeasures(xml.documentElement).forEach((measures, partIndex) => {
    const track = score.tracks[partIndex];
    if (!track) return;
    let divisions = 1;
    measures.forEach((measure, measureIndex) => {
      if (!measure) return;
      // 위치는 4분음표 = 960 tick 단위로 쌓습니다. 마디 중간에 divisions가 바뀌어도 그때의 단위로 바꿔 더합니다.
      const ticks = (element: Element) =>
        ((number(child(element, 'duration')) || 0) * 960) / divisions;
      let cursor = 0;
      let onset = 0;
      for (const element of measure.children) {
        if (element.tagName === 'attributes') {
          const value = number(child(element, 'divisions'));
          if (value > 0) divisions = value;
        } else if (element.tagName === 'backup') cursor -= ticks(element);
        else if (element.tagName === 'forward') cursor += ticks(element);
        else if (element.tagName === 'note' && !child(element, 'grace')) {
          if (!child(element, 'chord')) {
            onset = cursor;
            cursor += ticks(element);
          }
          apply(element, track, measureIndex, Math.round(onset));
        }
      }
    });
  });
}

function apply(
  element: Element,
  track: model.Track,
  measureIndex: number,
  tick: number,
) {
  const technical = children(element, 'notations').flatMap((n) =>
    children(n, 'technical'),
  );
  const marks = technical.flatMap((t) => [...t.children]);
  const hammer = marks.some(
    (m) =>
      (m.tagName === 'hammer-on' || m.tagName === 'pull-off') &&
      m.getAttribute('type') === 'start',
  );
  const harmonic = marks.find((m) => m.tagName === 'harmonic');
  if (!hammer && !harmonic) return;
  const string = number(marks.find((m) => m.tagName === 'string'));
  const fret = number(marks.find((m) => m.tagName === 'fret'));
  const staff = track.staves[(number(child(element, 'staff')) || 1) - 1];
  const bar = staff?.bars[measureIndex];
  // 줄이 없는 보표(오선보 쪽 복제 음 등)는 운지가 없어 옮기지 않습니다.
  if (
    !staff?.tuning.length ||
    !bar ||
    !Number.isInteger(string) ||
    !Number.isInteger(fret) ||
    string < 1 ||
    string > staff.tuning.length
  )
    return;
  const alphaString = staff.tuning.length - string + 1;
  const matches = bar.voices
    .flatMap((v) => v.beats)
    .filter(
      (b) => b.graceType === model.GraceType.None && b.playbackStart === tick,
    )
    .flatMap((b) => b.notes)
    .filter((n) => n.string === alphaString && n.fret === fret);
  const note = matches.length === 1 ? matches[0] : undefined;
  if (!note) return;
  if (hammer) {
    note.isHammerPullOrigin = true;
    const destination = sameStringDestination(note);
    note.hammerPullDestination = destination;
    if (destination) {
      destination.hammerPullOrigin ??= note;
      // 해머온 두 음에 정확히 걸친 슬러는 같은 레가토 표기라 지웁니다. 더 긴 슬러는 그대로 둡니다.
      if (note.slurDestination === destination) {
        note.slurDestination = null;
        destination.slurOrigin = null;
        destination.isSlurDestination = false;
      }
    }
  }
  if (harmonic) {
    const artificial = child(harmonic, 'artificial') !== undefined;
    note.harmonicType = artificial
      ? model.HarmonicType.Artificial
      : model.HarmonicType.Natural;
    if (!artificial) note.harmonicValue = note.fret;
  }
}

/**
 * alphaTab findHammerPullDestination의 같은 줄 탐색과 같습니다(같은 성부의 다음 박자들, 3마디 이내).
 * MusicXML 불러오기는 줄 번호를 박자에 넣은 뒤 정해 박자의 줄 조회표가 비어 있으므로 음 목록을 직접 봅니다.
 */
function sameStringDestination(note: model.Note): model.Note | null {
  const lastBar = note.beat.voice.bar.index + 3;
  for (
    let beat = note.beat.nextBeat;
    beat && beat.voice.bar.index <= lastBar;
    beat = beat.nextBeat
  ) {
    const found = beat.notes.find((n) => n.string === note.string);
    if (found) return found;
  }
  return null;
}

/** 압축 MusicXML(.mxl)의 루트 파일. prepareScoreArchive가 크기를 제한해 다시 묶은 무압축 ZIP만 받습니다. GP7 등 다른 ZIP은 null. */
function mxlRoot(zip: Uint8Array): Uint8Array | null {
  const files = unzipSync(zip);
  const container = files['META-INF/container.xml'];
  if (!container) return null;
  const path = new DOMParser()
    .parseFromString(decodeXml(container), 'application/xml')
    .getElementsByTagName('rootfile')[0]
    ?.getAttribute('full-path');
  return (path && files[path]) || null;
}
