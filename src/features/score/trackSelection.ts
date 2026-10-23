import type { model } from '@coderline/alphatab';
import type { GuitarPartRole, ScoreDocument } from '../../entities/score';
import type { ScoreSession } from './scoreSession';

export function importedInstrument(track: model.Track): 'GUITAR' | 'OTHER' {
  return track.playbackInfo.program >= 24 &&
    track.playbackInfo.program <= 31 &&
    !track.staves.some((staff) => staff.isPercussion)
    ? 'GUITAR'
    : 'OTHER';
}

export function getActiveTrackIndex(session: ScoreSession): number {
  const index =
    session.activePerformanceTrackId === undefined
      ? session.activeTrackIndex
      : session.document.tracks.findIndex(
          (track) => track.id === session.activePerformanceTrackId,
        );
  if (!session.document.tracks[index])
    throw new Error('선택한 악보 트랙을 찾을 수 없습니다.');
  return index;
}

export function selectScoreTrack(
  session: ScoreSession,
  id: string,
): ScoreSession {
  const index = session.document.tracks.findIndex((track) => track.id === id);
  if (index < 0) throw new Error('선택한 악보 트랙을 찾을 수 없습니다.');
  return { ...session, activeTrackIndex: index, activePerformanceTrackId: id };
}

export function scoreTrackEntries(session: ScoreSession) {
  return session.document.tracks.map((track, index) => {
    const original = session.score.tracks[index];
    return {
      track,
      instrument:
        track.instrument ?? (original ? importedInstrument(original) : 'OTHER'),
    };
  });
}

export function setGuitarRole(
  document: ScoreDocument,
  id: string,
  role: GuitarPartRole,
): ScoreDocument {
  if (!document.tracks.some((track) => track.id === id))
    throw new Error('역할을 변경할 악보 트랙을 찾을 수 없습니다.');
  return {
    ...document,
    tracks: document.tracks.map((track) =>
      track.id === id ? { ...track, role } : track,
    ),
  };
}
