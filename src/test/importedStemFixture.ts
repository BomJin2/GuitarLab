import type { ImportedGuitarStem } from '../features/performance/importedStems';
import { projectFixtureId } from './projectFixture';

// 실제 파일이나 AI 분석에 사용하지 않는 UI 테스트용 metadata입니다.
export function importedStemFixture(): ImportedGuitarStem {
  return {
    schemaVersion: 1,
    id: '00000000-0000-4000-8000-000000000040',
    projectId: projectFixtureId,
    name: '사용자 리드.wav',
    role: 'LEAD',
    origin: 'USER_IMPORTED',
    sampleRate: 48000,
    channels: 1,
    frames: 192000,
    durationMs: 4000,
    bytes: 768058,
    sha256: 'd'.repeat(64),
    peak: 0.5,
    createdAtMs: 1,
  };
}
