import { logDiagnostic } from '../../shared/logger';
import { importer, model, Logger, midi } from '@coderline/alphatab';
import type {
  ScoreDocument,
  NoteEvent,
  SyncAnchor,
  ScoreTrack,
} from '../../entities/score';
import { importedInstrument } from './trackSelection';
import { prepareScoreArchive } from './scoreArchive';
Logger.log = {
  debug: () => undefined,
  info: () => undefined,
  warning: () => logDiagnostic('warn', 'SCORE_WARNING'),
  error: () => logDiagnostic('error', 'SCORE_IMPORT_FAILED'),
};
export function importScore(data: Uint8Array): model.Score {
  return importer.ScoreLoader.loadScoreFromBytes(prepareScoreArchive(data));
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
export function normalizeScore(
  score: model.Score,
  lookup = buildPlaybackLookup(score),
): ScoreDocument {
  const id = crypto.randomUUID();
  const noteIds = new Map<model.Note, string>();
  const tracks = score.tracks.map<ScoreTrack>((track) => {
    const trackId = crypto.randomUUID();
    const notes: NoteEvent[] = [];
    for (const occurrence of lookup.masterBars)
      for (const staff of track.staves) {
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
              notes.push({
                id: crypto.randomUUID(),
                notationNoteId,
                trackId,
                measureIndex: bar.index,
                startTick: occurrence.start + beat.playbackStart,
                durationTicks: Math.max(1, beat.playbackDuration),
                pitchMidi: note.realValue,
                attack: !note.isTieDestination,
                ...(hasUnsupportedTechnique(note)
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
    notes.sort((a, b) => a.startTick - b.startTick);
    if (notes.length > 100000)
      throw new Error('트랙의 음표 수가 너무 많습니다.');
    return {
      id: trackId,
      name: track.name || `트랙 ${track.index + 1}`,
      tuningMidi: [...(track.staves[0]?.tuning ?? [])],
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
    title: score.title || '불러온 악보',
    ppq: 960,
    tempoMap,
    timeSignatures,
    syncAnchors: anchors,
    tracks,
  };
}

function hasUnsupportedTechnique(note: model.Note): boolean {
  return (
    note.hasBend ||
    note.isContinuedBend ||
    note.slideInType !== model.SlideInType.None ||
    note.slideOutType !== model.SlideOutType.None ||
    note.slideOrigin !== null ||
    note.isHammerPullOrigin ||
    note.isHammerPullDestination ||
    note.isLeftHandTapped ||
    note.isGhost ||
    note.isPalmMute ||
    note.isDead ||
    note.isHarmonic ||
    note.vibrato !== model.VibratoType.None ||
    note.isTrill ||
    note.ornament !== model.NoteOrnament.None ||
    note.beat.graceType !== model.GraceType.None ||
    note.beat.isLegatoOrigin ||
    note.beat.isLegatoDestination ||
    note.beat.tap ||
    note.beat.slap ||
    note.beat.pop ||
    note.beat.deadSlapped ||
    note.beat.golpe !== model.GolpeType.None ||
    note.beat.fade !== model.FadeType.None ||
    note.beat.hasRasgueado ||
    note.beat.hasWhammyBar ||
    note.beat.isTremolo ||
    note.beat.vibrato !== model.VibratoType.None
  );
}
function notePosition(note: NoteEvent): string {
  return [
    note.measureIndex,
    note.startTick,
    note.durationTicks,
    note.pitchMidi,
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
    const unsupported = new Set(
      source.tracks[index]?.notes
        .filter((n) => n.judgementSupport === 'UNSUPPORTED')
        .map(notePosition),
    );
    if (!unsupported.size) return track;
    const positions = new Set(track.notes.map(notePosition));
    if ([...unsupported].some((position) => !positions.has(position)))
      throw new Error(
        '원본 주법과 저장 음표가 달라 안전하게 채점할 수 없습니다. 원본 악보를 다시 불러오세요.',
      );
    const notes = track.notes.map((note) => {
      if (
        note.judgementSupport === 'UNSUPPORTED' ||
        !unsupported.has(notePosition(note))
      )
        return note;
      changed = true;
      return { ...note, judgementSupport: 'UNSUPPORTED' as const };
    });
    return { ...track, notes };
  });
  return changed ? { ...document, tracks } : document;
}
