import type {
  AiDraft,
  TranscriptionRequest,
} from '../features/transcription/transcription';
export const transcriptionRequest: TranscriptionRequest = {
  projectId: '00000000-0000-4000-8000-000000000001',
  assetId: '00000000-0000-4000-8000-000000000002',
  tuningMidi: [64, 59, 55, 50, 45, 40],
  syncAnchors: [
    { scoreTick: 0, audioTimeMs: 0 },
    { scoreTick: 7680, audioTimeMs: 4000 },
  ],
  grid: 240,
};
// 테스트 전용이며 제품 분석 결과에 사용하지 않습니다.
export function transcriptionFixture(): AiDraft {
  return {
    schemaVersion: 1,
    projectId: transcriptionRequest.projectId,
    assetId: transcriptionRequest.assetId,
    inputSha256: 'a'.repeat(64),
    modelId: 'basic-pitch',
    modelVersion: '0.4.0',
    status: 'AI_DRAFT',
    confidenceMeaning: 'MEAN_NOTE_ACTIVATION',
    durationMs: 4000,
    notes: [
      {
        onsetMs: 10,
        offsetMs: 450,
        pitchMidi: 67,
        confidence: 0.6,
        startTick: 0,
        durationTicks: 960,
        candidates: [{ stringIndex: 1, fret: 3 }],
        fingering: { stringIndex: 1, fret: 3 },
        reviewReasons: ['LOW_CONFIDENCE'],
        source: 'ai',
      },
    ],
  };
}
