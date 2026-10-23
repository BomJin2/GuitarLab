import type {
  SeparationInfo,
  SeparationRequest,
} from '../features/transcription/separation';
import { projectFixtureId, projectAssetId } from './projectFixture';

export const separationRequest: SeparationRequest = {
  projectId: projectFixtureId,
  assetId: projectAssetId,
};
// 테스트 전용 DEMO 데이터이며 실제 분리 결과로 표시하지 않습니다.
export function separationFixture(): SeparationInfo {
  return {
    schemaVersion: 1,
    stemSetId: '00000000-0000-4000-8000-000000000003',
    createdAtMs: 1792240000000,
    ...separationRequest,
    inputSha256: 'a'.repeat(64),
    modelId: 'htdemucs_6s',
    modelVersion: '4.1.0',
    modelRevision: '3c5ee475be622df764938de97e4281a7b07ffa58',
    weightsSha256:
      'd2a1745f0744721f6b8ca5bf469b67c651ea5ed1b52998cab033b2158609d411',
    sampleRate: 44100,
    channels: 2,
    frames: 2,
    durationMs: (2 * 1000) / 44100,
    startOffsetMs: 0,
    status: 'AI_ESTIMATE',
    stems: [
      {
        id: '00000000-0000-4000-8000-000000000004',
        role: 'GUITAR_FULL',
        sha256: 'b'.repeat(64),
        peak: 0.5,
        bytes: 60,
      },
      {
        id: '00000000-0000-4000-8000-000000000005',
        role: 'ACCOMPANIMENT',
        sha256: 'c'.repeat(64),
        peak: 0.4,
        bytes: 60,
      },
    ],
  };
}
