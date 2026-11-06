import { logDiagnostic } from '../../shared/logger';
import { importer, model, Logger, midi } from '@coderline/alphatab';
import {
  linkTargets,
  linkTechniques,
  type Technique,
  type ScoreDocument,
  type NoteEvent,
  type SyncAnchor,
  type ScoreTrack,
} from '../../entities/score';
import { importedInstrument } from './trackSelection';
import { prepareScoreArchive } from './scoreArchive';
import { applyMusicXmlTechniques } from './musicXmlTechniques';
Logger.log = {
  debug: () => undefined,
  info: () => undefined,
  warning: () => logDiagnostic('warn', 'SCORE_WARNING'),
  error: () => logDiagnostic('error', 'SCORE_IMPORT_FAILED'),
};
export function importScore(data: Uint8Array): model.Score {
  const prepared = prepareScoreArchive(data);
  const score = importer.ScoreLoader.loadScoreFromBytes(prepared);
  applyMusicXmlTechniques(score, prepared);
  return score;
}
/** 원본 파일의 제목·이름을 저장 규칙에 맞춥니다: 제어문자·짝 없는 서로게이트→공백, 앞뒤 공백 제거, 200자, 비면 기본값(docs/12). */
function cleanName(text: string, fallback: string): string {
  const cleaned = [...text.replace(/[\p{Cc}\p{Cs}]+/gu, ' ').trim()]
    .slice(0, 200)
    .join('')
    .trim();
  return cleaned || fallback;
}
export function buildPlaybackLookup(score: model.Score) {
  if (!score.masterBars.length || score.masterBars.length > 10000)
    throw new Error('악보 마디 수를 확인하세요.');
  const generator = new midi.MidiFileGenerator(
    score,
    null,
    new midi.AlphaSynthMidiFileHandler(new midi.MidiFile()),
  );
  generator.generate();
  if (generator.tickLookup.masterBars.length > 20000)
    throw new Error('반복을 펼친 악보가 너무 큽니다.');
  return generator.tickLookup;
}
/** docs/12 playbackTick v1: 소리 시각은 시작보다 뒤, 끝보다 앞이어야 합니다. */
function swungInside(beat: model.Beat, playback: number | undefined) {
  return (
    playback !== undefined &&
    playback > beat.playbackStart &&
    playback < beat.playbackStart + Math.max(1, beat.playbackDuration)
  );
}
export function normalizeScore(
  score: model.Score,
  lookup = buildPlaybackLookup(score),
): ScoreDocument {
  const id = crypto.randomUUID();
  const noteIds = new Map<model.Note, string>();
  const tracks = score.tracks.map<ScoreTrack>((track) => {
    const trackId = crypto.randomUUID();
    // docs/12 복제 보표 제외: 줄 있는 보표가 있으면 줄 없는 보표(오선보 쪽 복제 음)는 넣지 않습니다.
    const stringed = track.staves.filter((s) => s.tuning.length > 0);
    const staves = stringed.length ? stringed : track.staves;
    const notes: NoteEvent[] = [];
    // 이음 시작 음 ID → alphaTab이 정한 도착 음(같은 성부의 다음 박자)
    const linkedTo = new Map<string, model.Note | null>();
    // 자연 하모닉 음 ID → 소리 음정. 미지원으로 남는 음은 예전 저장본과 같도록 이 값을 씁니다.
    const harmonicSounding = new Map<string, number>();
    for (const occurrence of lookup.masterBars) {
      // 스윙(셋잇단 느낌)으로 소리 시각이 밀린 박자. startTick은 악보 위치라 그대로 두고 소리 시각을 따로 둡니다(docs/12 playbackTick v1).
      const swung = new Map<model.Beat, number>();
      for (let item = occurrence.firstBeat; item; item = item.nextBeat)
        for (const highlighted of item.highlightedBeats)
          if (highlighted.playbackStart !== highlighted.beat.playbackStart)
            swung.set(highlighted.beat, highlighted.playbackStart);
      for (const staff of staves) {
        const bar = staff.bars[occurrence.masterBar.index];
        if (!bar) continue;
        for (const voice of bar.voices)
          for (const beat of voice.beats)
            for (const note of beat.notes) {
              let notationNoteId = noteIds.get(note);
              if (!notationNoteId) {
                notationNoteId = crypto.randomUUID();
                noteIds.set(note, notationNoteId);
              }
              const noteId = crypto.randomUUID();
              if (note.isHammerPullOrigin)
                linkedTo.set(noteId, note.hammerPullDestination);
              else if (note.slideTarget) linkedTo.set(noteId, note.slideTarget);
              if (note.harmonicType === model.HarmonicType.Natural)
                harmonicSounding.set(noteId, note.realValue);
              notes.push({
                id: noteId,
                notationNoteId,
                trackId,
                measureIndex: bar.index,
                startTick: occurrence.start + beat.playbackStart,
                durationTicks: Math.max(1, beat.playbackDuration),
                // 자연 하모닉은 편집·저장 규칙(줄 튜닝 + 프렛)에 맞춰 프렛 음정을 씁니다. 감점 제외라 채점에는 쓰지 않습니다.
                // 미지원으로 남는 자연 하모닉은 아래에서 예전처럼 소리 음정으로 되돌립니다.
                pitchMidi:
                  note.harmonicType === model.HarmonicType.Natural
                    ? note.realValueWithoutHarmonic
                    : note.realValue,
                attack: !note.isTieDestination,
                ...(swungInside(beat, swung.get(beat))
                  ? { playbackTick: occurrence.start + swung.get(beat)! }
                  : {}),
                ...v1Techniques(note).fields,
                // 소리 시각이 음 안으로 밀리지 않는 스윙(앞당기는 Scottish 등)은 playbackTick v1로 표현할 수 없어 감점 제외합니다.
                ...(hasUnsupportedTechnique(note) ||
                (swung.has(beat) && !swungInside(beat, swung.get(beat)))
                  ? { judgementSupport: 'UNSUPPORTED' as const }
                  : {}),
                ...(note.string > 0
                  ? {
                      stringIndex: staff.tuning.length - note.string + 1,
                      fret: note.fret,
                    }
                  : {}),
                source: 'import',
              });
            }
      }
    }
    notes.sort((a, b) => a.startTick - b.startTick);
    // 이음의 도착 음이 v2 규칙(같은 줄 다음 음)으로 없으면 표현할 수 없으므로 감점 제외·편집 거부로 둡니다.
    const byId = new Map(notes.map((n) => [n.id, n]));
    const droppedDestinations = new Set<string>();
    // 같은 tick·같은 줄 음의 수. 도착 후보가 여럿이면 새로 만든 음 ID 순서에 따라 도착 음이 바뀌므로(원본 기준 복원 때마다 다름) 이음을 옮기지 않습니다.
    const spot = (n: NoteEvent) => `${n.startTick}:${n.stringIndex}`;
    const spots = new Map<string, number>();
    for (const n of notes)
      if (n.stringIndex !== undefined)
        spots.set(spot(n), (spots.get(spot(n)) ?? 0) + 1);
    for (const [id, target] of linkTargets(notes)) {
      const origin = byId.get(id);
      const expected = linkedTo.get(id);
      // 성부·반복 때문에 v2 규칙의 도착 음이 alphaTab의 도착 음과 다르면 표현할 수 없습니다.
      if (
        !origin ||
        (target &&
          expected &&
          target.notationNoteId === noteIds.get(expected) &&
          spots.get(spot(target)) === 1)
      )
        continue;
      const rest = origin.techniques?.filter(
        (t) => !linkTechniques.includes(t),
      );
      if (rest?.length) origin.techniques = rest;
      else {
        delete origin.techniques;
        delete origin.bendSemitones;
      }
      origin.judgementSupport = 'UNSUPPORTED';
      const dropped = expected && noteIds.get(expected);
      if (dropped) droppedDestinations.add(dropped);
    }
    // 이음을 지운 시작 음의 실제 도착 음도 피킹이 없으므로 예전처럼 감점 제외로 둡니다.
    for (const note of notes)
      if (droppedDestinations.has(note.notationNoteId ?? ''))
        note.judgementSupport = 'UNSUPPORTED';
    // 주법 편집 v2 이전에는 자연 하모닉이 늘 미지원·소리 음정이었습니다. 미지원으로 남는 음(편집 불가)은 그 값을 유지해
    // 예전 저장본의 원본 기준 복원(위치 비교)이 어긋나지 않게 합니다.
    for (const note of notes) {
      const sounding = harmonicSounding.get(note.id);
      if (note.judgementSupport === 'UNSUPPORTED' && sounding !== undefined)
        note.pitchMidi = sounding;
    }
    if (notes.length > 100000)
      throw new Error('트랙의 음표 수가 너무 많습니다.');
    return {
      id: trackId,
      name: cleanName(track.name, `트랙 ${track.index + 1}`),
      tuningMidi: [...(staves[0]?.tuning ?? [])],
      instrument: importedInstrument(track),
      role: 'UNKNOWN',
      notes,
    };
  });
  const tempos = new Map<number, number>([[0, score.tempo]]);
  const timeSignatures = lookup.masterBars.map((bar) => ({
    tick: bar.start,
    numerator: bar.masterBar.timeSignatureNumerator,
    denominator: bar.masterBar.timeSignatureDenominator,
  }));
  for (const bar of lookup.masterBars)
    for (const tempo of bar.tempoChanges) tempos.set(tempo.tick, tempo.tempo);
  const tempoMap = [...tempos]
    .sort(([a], [b]) => a - b)
    .map(([tick, bpm]) => ({ tick, bpm }))
    .filter(
      (point, index, points) =>
        index === 0 || points[index - 1]?.bpm !== point.bpm,
    );
  if (
    tempoMap.some(
      (point) =>
        !Number.isFinite(point.bpm) || point.bpm < 10 || point.bpm > 600,
    )
  )
    throw new Error('지원 범위(10~600 BPM) 밖의 템포입니다.');
  const endTick = lookup.masterBars.at(-1)?.end ?? 3840;
  const anchors: SyncAnchor[] = [];
  let previousTick = 0;
  let audioTimeMs = 0;
  let previousBpm = tempoMap[0]?.bpm ?? 120;
  for (const tempo of tempoMap) {
    audioTimeMs += ((tempo.tick - previousTick) * 60000) / (960 * previousBpm);
    anchors.push({ scoreTick: tempo.tick, audioTimeMs });
    previousTick = tempo.tick;
    previousBpm = tempo.bpm;
  }
  if (endTick > previousTick)
    anchors.push({
      scoreTick: endTick,
      audioTimeMs:
        audioTimeMs + ((endTick - previousTick) * 60000) / (960 * previousBpm),
    });
  if (anchors.length < 2)
    throw new Error('재생 가능한 악보 시간이 부족합니다.');
  return {
    schemaVersion: 1,
    id,
    title: cleanName(score.title, '불러온 악보'),
    ppq: 960,
    tempoMap,
    timeSignatures,
    syncAnchors: anchors,
    tracks,
  };
}

// MusicXML x/circle-x noteheads mean dead notes but alphaTab stores them as style only.
const deadNoteHeads: ReadonlySet<model.MusicFontSymbol> = new Set([
  model.MusicFontSymbol.NoteheadXDoubleWhole,
  model.MusicFontSymbol.NoteheadXWhole,
  model.MusicFontSymbol.NoteheadXHalf,
  model.MusicFontSymbol.NoteheadXBlack,
  model.MusicFontSymbol.NoteheadCircleXDoubleWhole,
  model.MusicFontSymbol.NoteheadCircleXWhole,
  model.MusicFontSymbol.NoteheadCircleXHalf,
  model.MusicFontSymbol.NoteheadCircleX,
]);
/** 시작 0에서 한 번 올라가는 반음·온음 벤딩만 편집 가능한 BEND입니다(값 2 = 반음). */
function simpleBend(note: model.Note): 1 | 2 | null {
  const points = note.bendPoints ?? [];
  const [first, last] = [points[0], points[points.length - 1]];
  if (
    note.isContinuedBend ||
    points.length !== 2 ||
    first?.value !== 0 ||
    (last?.value !== 2 && last?.value !== 4)
  )
    return null;
  return last.value === 2 ? 1 : 2;
}
// docs/12 "주법 편집 v1": 편집 가능한 7가지 주법. techniqueOrder 순서로 넣습니다.
function v1Techniques(note: model.Note): {
  fields: { techniques?: Technique[]; bendSemitones?: 1 | 2 };
} {
  const list: Technique[] = [];
  if (
    note.isPalmMute ||
    // MusicXML P.M. 범위는 박자에만 표시됩니다. GP는 음 표시에서 박자로 올라오므로 화음의 다른 음에 퍼뜨리지 않습니다.
    (note.beat.isPalmMute &&
      !note.beat.notes.some((n) => n.isPalmMute && !n.isTieDestination))
  )
    list.push('PALM_MUTE');
  if (
    note.isDead ||
    (note.style?.noteHead !== undefined &&
      deadNoteHeads.has(note.style.noteHead))
  )
    list.push('DEAD');
  if (note.isGhost) list.push('GHOST');
  if (note.isStaccato) list.push('STACCATO');
  if (note.vibrato !== model.VibratoType.None) list.push('VIBRATO');
  const bend = note.hasBend ? simpleBend(note) : null;
  if (bend) list.push('BEND');
  if (note.isLeftHandTapped || note.beat.tap) list.push('TAP');
  // 주법 편집 v2: 같은 줄 다음 음으로 이어지는 해머온·슬라이드(이음 하나), 자연 하모닉, 음 렛링
  // 해머온과 슬라이드가 함께 붙은 음은 이음 하나로 표현할 수 없어 옮기지 않습니다(미지원).
  if (!hammerAndSlide(note)) {
    if (
      note.isHammerPullOrigin &&
      note.hammerPullDestination?.string === note.string
    )
      list.push('HAMMER');
    else if (note.slideOutType === model.SlideOutType.Legato)
      list.push('SLIDE_LEGATO');
    else if (note.slideOutType === model.SlideOutType.Shift)
      list.push('SLIDE_SHIFT');
  }
  if (reproducibleNaturalHarmonic(note)) list.push('HARMONIC_NATURAL');
  if (note.isLetRing) list.push('LET_RING');
  return {
    fields: list.length
      ? { techniques: list, ...(bend ? { bendSemitones: bend } : {}) }
      : {},
  };
}
const hammerAndSlide = (note: model.Note) =>
  note.isHammerPullOrigin && note.slideOutType !== model.SlideOutType.None;
// AlphaTex `nh`는 하모닉 값을 프렛에서 다시 계산합니다(alphaTab ModelUtils.deltaFretToHarmonicValue).
// 그 값이 프렛과 같은 프렛에서, 원본 값도 프렛과 같을 때만 같은 소리로 다시 만들 수 있습니다.
const naturalHarmonicFrets = new Set([4, 5, 7, 9, 12, 16, 17, 19, 24]);
function reproducibleNaturalHarmonic(note: model.Note) {
  return (
    note.harmonicType === model.HarmonicType.Natural &&
    naturalHarmonicFrets.has(note.fret) &&
    note.harmonicValue === note.fret
  );
}
/** 주법 편집 v1·v2로 표현할 수 없는 주법(편집 거부·감점 제외). */
function hasUnsupportedTechnique(note: model.Note): boolean {
  return (
    // 해머온+슬라이드가 함께 붙은 음과 그 도착 음
    hammerAndSlide(note) ||
    (note.hammerPullOrigin !== null && hammerAndSlide(note.hammerPullOrigin)) ||
    (note.slideOrigin !== null && hammerAndSlide(note.slideOrigin)) ||
    (note.hasBend && simpleBend(note) === null) ||
    note.isContinuedBend ||
    note.slideInType !== model.SlideInType.None ||
    // 이어 치기·연결 슬라이드(와 그 도착 음)는 v2 주법입니다. 나머지 슬라이드 아웃은 표현 불가입니다.
    (note.slideOutType !== model.SlideOutType.None &&
      note.slideOutType !== model.SlideOutType.Legato &&
      note.slideOutType !== model.SlideOutType.Shift) ||
    // 다른 줄의 태핑 음으로 이어지는 해머온은 v2 규칙(같은 줄)으로 표현할 수 없습니다.
    (note.isHammerPullOrigin &&
      note.hammerPullDestination?.string !== note.string) ||
    // 도착 음은 같은 줄의 v2 이음(해머온·이어지는 슬라이드)에서 올 때만 표현할 수 있습니다.
    (note.slideOrigin !== null &&
      (note.slideOrigin.string !== note.string ||
        (note.slideOrigin.slideOutType !== model.SlideOutType.Legato &&
          note.slideOrigin.slideOutType !== model.SlideOutType.Shift))) ||
    (note.hammerPullOrigin !== null &&
      note.hammerPullOrigin.string !== note.string) ||
    // MusicXML/AlphaTex slur is a separate field from hammer-on and usually marks TAB legato.
    note.isSlurOrigin ||
    note.isSlurDestination ||
    (note.isHarmonic && !reproducibleNaturalHarmonic(note)) ||
    note.isTrill ||
    note.ornament !== model.NoteOrnament.None ||
    note.beat.graceType !== model.GraceType.None ||
    // MusicXML LetRing dashes set only the beat flag; GP raises it from an attacked note's flag, which must not spread to chord mates.
    (note.beat.isLetRing &&
      !note.beat.notes.some((n) => n.isLetRing && !n.isTieDestination)) ||
    note.beat.isLegatoOrigin ||
    note.beat.isLegatoDestination ||
    note.beat.slap ||
    note.beat.pop ||
    note.beat.deadSlapped ||
    note.beat.golpe !== model.GolpeType.None ||
    note.beat.fade !== model.FadeType.None ||
    note.beat.hasRasgueado ||
    note.beat.hasWhammyBar ||
    note.beat.isTremolo ||
    note.beat.vibrato !== model.VibratoType.None ||
    // 브러시·아르페지오는 alphaTab이 음마다 줄별 시간차를 더해 박자 시작 시각과 어긋납니다(docs/12).
    note.beat.brushType !== model.BrushType.None
  );
}
function notePosition(note: NoteEvent): string {
  // 줄·프렛이 있으면 그것으로 음을 가립니다. 하모닉 해석이 바뀌면 같은 음의 저장 음정이 원본과 달라질 수 있습니다(구형 저장본 열기).
  const fretted = note.stringIndex !== undefined && note.fret !== undefined;
  return [
    note.measureIndex,
    note.startTick,
    note.durationTicks,
    fretted ? '' : note.pitchMidi,
    note.stringIndex ?? '',
    note.fret ?? '',
  ].join(':');
}
export function restoreJudgementSupport(
  document: ScoreDocument,
  score: model.Score,
  lookup = buildPlaybackLookup(score),
): ScoreDocument {
  if (document.renderSource === 'NORMALIZED') return document;
  const source = normalizeScore(score, lookup);
  let changed = false;
  const tracks = document.tracks.map((track, index) => {
    const sourceNotes = source.tracks[index]?.notes ?? [];
    const unsupported = new Set(
      sourceNotes
        .filter((n) => n.judgementSupport === 'UNSUPPORTED')
        .map(notePosition),
    );
    // 구형 저장 악보에는 없는 스윙 소리 시각을 원본에서 채웁니다(docs/12 playbackTick v1).
    const playback = new Map(
      sourceNotes.flatMap((n) =>
        n.playbackTick === undefined
          ? []
          : [[notePosition(n), n.playbackTick] as const],
      ),
    );
    // 예전에는 감점 제외로만 남던 v1 주법을 편집 가능한 필드로 옮깁니다(docs/12 주법 편집 v1).
    const techniques = new Map(
      sourceNotes.flatMap((n) =>
        n.techniques === undefined ? [] : [[notePosition(n), n] as const],
      ),
    );
    // 원본 기준으로 표현할 수 있는 위치(예전 해머온·슬라이드 도착 음처럼 주법 필드 없이 막혔던 음 포함)
    const supported = new Set(
      sourceNotes
        .filter((n) => n.judgementSupport !== 'UNSUPPORTED')
        .map(notePosition),
    );
    // 같은 위치에 미지원 원본 음이 하나라도 있으면(성부 겹침) 제외를 유지합니다.
    const clears = (position: string) =>
      supported.has(position) && !unsupported.has(position);
    // 저장 음정이 원본과 다르면(하모닉 해석이 바뀐 구형 저장본) 원본 판정·주법을 가져오지 않고 제외로 둡니다.
    const pitches = new Map(
      sourceNotes.map((n) => [notePosition(n), n.pitchMidi] as const),
    );
    const repitched = (n: NoteEvent) =>
      (pitches.get(notePosition(n)) ?? n.pitchMidi) !== n.pitchMidi;
    const stale = track.notes.some((n) =>
      n.judgementSupport === 'UNSUPPORTED'
        ? clears(notePosition(n)) && !repitched(n)
        : repitched(n),
    );
    if (!unsupported.size && !playback.size && !techniques.size && !stale)
      return track;
    const positions = new Set(track.notes.map(notePosition));
    if ([...unsupported].some((position) => !positions.has(position)))
      throw new Error(
        '원본 주법과 저장 음표가 달라 안전하게 채점할 수 없습니다. 원본 악보를 다시 불러오세요.',
      );
    const notes = track.notes.map((note) => {
      const position = notePosition(note);
      let next = note;
      const differs = repitched(note);
      if (
        note.judgementSupport !== 'UNSUPPORTED' &&
        (unsupported.has(position) || differs)
      )
        next = { ...next, judgementSupport: 'UNSUPPORTED' as const };
      const tick = playback.get(position);
      if (note.playbackTick === undefined && tick !== undefined)
        next = { ...next, playbackTick: tick };
      const source = techniques.get(position);
      if (source && note.techniques === undefined && !differs) {
        next = {
          ...next,
          techniques: source.techniques,
          ...(source.bendSemitones
            ? { bendSemitones: source.bendSemitones }
            : {}),
        };
      }
      // 원본 기준으로 표현 불가 주법이 없으면 예전 감점 제외 표시를 지웁니다.
      if (
        next.judgementSupport === 'UNSUPPORTED' &&
        clears(position) &&
        !differs
      ) {
        const rest = { ...next };
        delete rest.judgementSupport;
        next = rest;
      }
      if (next !== note) changed = true;
      return next;
    });
    return { ...track, notes };
  });
  return changed ? { ...document, tracks } : document;
}
