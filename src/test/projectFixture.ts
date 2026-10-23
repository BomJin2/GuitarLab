import type {
  ProjectDetails,
  ProjectSummary,
  RevisionDocument,
} from '../features/library/projects';
import type { ScoreDocument } from '../entities/score';
import { practiceFixture, practiceFixtureId } from './practiceFixture';
import type { StoredAttempt } from '../features/practice/records';
export const projectFixtureId = practiceFixtureId;
export const projectAssetId = '00000000-0000-4000-8000-000000000002';
export function projectFixture(): ProjectDetails {
  const score: ScoreDocument = {
    schemaVersion: 1,
    id: 'score',
    title: '자체 악보',
    ppq: 960,
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    syncAnchors: [
      { scoreTick: 0, audioTimeMs: 0 },
      { scoreTick: 3840, audioTimeMs: 2000 },
    ],
    tracks: [
      {
        id: 'guitar',
        name: 'Guitar',
        tuningMidi: [64, 59, 55, 50, 45, 40],
        notes: [
          {
            id: 'a',
            trackId: 'guitar',
            measureIndex: 0,
            startTick: 960,
            durationTicks: 960,
            pitchMidi: 67,
            source: 'import',
          },
        ],
      },
    ],
  };
  const project: ProjectSummary = {
    id: projectFixtureId,
    title: '로컬 연습',
    artist: null,
    mode: 'practice',
    revision: 1,
    revisionId: practiceFixtureId,
    updatedAtMs: 1791900000000,
  };
  const revision: RevisionDocument = {
    schemaVersion: 1,
    projectId: project.id,
    revisionId: practiceFixtureId,
    revision: 1,
    scoreAssetId: projectAssetId,
    score,
    workspace: {
      activeTrackIndex: 0,
      audioAssetId: null,
      positionMs: 500,
      rate: 0.75,
      playbackLoop: { enabled: false, startMs: 0, endMs: 0 },
    },
  };
  return {
    schemaVersion: 1,
    project,
    revision,
    assets: [
      {
        id: projectAssetId,
        projectId: project.id,
        kind: 'SCORE_IMPORT',
        storage: 'REFERENCE',
        name: '자체.musicxml',
        sha256: 'a'.repeat(64),
        bytes: 1024,
        available: true,
      },
    ],
  };
}
export function recordFixture(): StoredAttempt {
  const snapshot = {
    ...practiceFixture(),
    state: 'FINISHED' as const,
    targetCount: 1,
  };
  return {
    schemaVersion: 1,
    projectId: projectFixtureId,
    sessionId: practiceFixtureId,
    attemptId: snapshot.attemptId,
    revisionId: snapshot.scoreRevision,
    trackId: snapshot.trackId,
    scoringVersion: 'monophonic-poc-v1',
    configFingerprint: 'a'.repeat(64),
    state: 'FINISHED',
    startedAtMs: 1791900000000,
    endedAtMs: 1791900001000,
    completedOrder: 1,
    snapshot,
  };
}
