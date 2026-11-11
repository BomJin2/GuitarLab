import { importer } from '@coderline/alphatab';
import { expect, it } from 'vitest';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { buildPlaybackLookup, normalizeScore } from './alphaTabAdapter';
import { editNote } from './scoreEditing';
import { renderNormalized } from './normalizedNotation';
import { renderedNoteId } from './scoreNoteSelection';
import { selectScoreTrack } from './trackSelection';

it('실제 원본과 재렌더의 객체를 시각·음정·운지로 도메인 ID에 연결하고 옛 렌더는 거부한다', () => {
  const session = scoreEditingFixture();
  const track = session.document.tracks[0]!;
  const note =
    session.score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!.notes[0]!;
  const before = JSON.stringify(session.document);
  expect(renderedNoteId(session, note, 0)).toBe(track.notes[1]?.id);
  const document = editNote(session.document, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: track.notes[1]!.id,
    value: { startTick: 960, durationTicks: 960, stringIndex: 2, fret: 8 },
  });
  const next = { ...session, document, ...renderNormalized(document) };
  const fresh =
    next.score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!.notes[0]!;
  expect(renderedNoteId(next, fresh, 0)).toBe(track.notes[1]?.id);
  expect(renderedNoteId(next, note, 0)).toBeNull();
  expect(renderedNoteId(session, fresh, 0)).toBeNull();
  expect(JSON.stringify(session.document)).toBe(before);
});

it('반복 표기는 현재 tick에 가까운 occurrence를 선택하고 동률은 앞 occurrence를 사용한다', () => {
  const session = scoreEditingFixture();
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4 5.1.4 7.1.4');
  score.masterBars[0]!.isRepeatStart = true;
  score.masterBars[0]!.repeatCount = 2;
  score.rebuildRepeatGroups();
  const playbackLookup = buildPlaybackLookup(score);
  const document = normalizeScore(score, playbackLookup);
  const repeated = { ...session, score, document, playbackLookup };
  const note =
    score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!;
  expect(renderedNoteId(repeated, note, 0)).toBe(
    document.tracks[0]?.notes[0]?.id,
  );
  expect(renderedNoteId(repeated, note, 3840)).toBe(
    document.tracks[0]?.notes[4]?.id,
  );
  expect(renderedNoteId(repeated, note, 1920)).toBe(
    document.tracks[0]?.notes[0]?.id,
  );
  expect(renderedNoteId(repeated, note, NaN)).toBeNull();
});

it('다른 트랙·겹친 후보·불일치한 운지는 ID를 추측하지 않는다', () => {
  const session = scoreEditingFixture();
  const track = session.document.tracks[0]!;
  const document = {
    ...session.document,
    renderSource: 'NORMALIZED' as const,
    tracks: [
      track,
      { ...track, id: crypto.randomUUID(), name: '다른 기타', notes: [] },
    ],
  };
  const next = { ...session, document, ...renderNormalized(document) };
  const note =
    next.score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!;
  expect(
    renderedNoteId(selectScoreTrack(next, document.tracks[1]!.id), note, 0),
  ).toBeNull();
  const changed = {
    ...session,
    document: {
      ...session.document,
      tracks: [
        {
          ...track,
          notes: track.notes.map((n) => ({ ...n, fret: n.fret! + 1 })),
        },
      ],
    },
  };
  const original =
    session.score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!;
  expect(renderedNoteId(changed, original, 0)).toBeNull();
  const ambiguous = {
    ...session,
    document: {
      ...session.document,
      tracks: [
        {
          ...track,
          notes: [
            ...track.notes,
            { ...track.notes[0]!, id: crypto.randomUUID() },
          ],
        },
      ],
    },
  };
  expect(renderedNoteId(ambiguous, original, 0)).toBeNull();
});

it('자연 하모닉 5·7·12프렛을 TAB에서 눌러도 각 음을 선택한다(2026-11-08 리뷰)', () => {
  const session = scoreEditingFixture();
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 5.6{nh}.4 7.6{nh}.4 12.6{nh}.4 3.1.4',
  );
  const playbackLookup = buildPlaybackLookup(score);
  const document = normalizeScore(score, playbackLookup);
  const harmonics = { ...session, score, document, playbackLookup };
  const beats = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats;
  const ids = beats.map((beat, i) =>
    renderedNoteId(harmonics, beat.notes[0]!, i * 960),
  );
  expect(ids).toEqual(document.tracks[0]!.notes.map((n) => n.id));
});
