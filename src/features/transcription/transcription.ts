import { isTauri } from '@tauri-apps/api/core';
import {
  isRecord,
  isNumberWithin,
  isSafeUnsigned,
} from '../../shared/validation';
import { isUuid, runStorageJob } from '../library/projects';
import type { SyncAnchor } from '../../entities/score';
import type { ScoreSession } from '../score/scoreSession';
import { getActiveTrackIndex } from '../score/trackSelection';
import {
  editorBars,
  prepareEditingDocument,
  renderNormalized,
} from '../score/normalizedNotation';

export const reviewLabels = {
  LOW_CONFIDENCE: '낮은 모델 활성도',
  OUT_OF_RANGE: '기타 음역 밖',
  QUANTIZATION_SHIFT: '박자 정리 오차',
  FINGERING_AMBIGUOUS: '여러 운지 후보',
  POLYPHONY: '화음/음표 중첩',
};
export type ReviewReason = keyof typeof reviewLabels;
type Fingering = { stringIndex: number; fret: number };
export type AiDraftNote = {
  onsetMs: number;
  offsetMs: number;
  pitchMidi: number;
  confidence: number;
  startTick: number;
  durationTicks: number;
  candidates: Fingering[];
  fingering: Fingering | null;
  reviewReasons: ReviewReason[];
  source: 'ai';
};
export type AiDraft = {
  schemaVersion: 1;
  projectId: string;
  assetId: string;
  stemId?: string;
  importedStemId?: string;
  inputSha256: string;
  modelId: 'basic-pitch';
  modelVersion: '0.4.0';
  status: 'AI_DRAFT';
  confidenceMeaning: 'MEAN_NOTE_ACTIVATION';
  durationMs: number;
  notes: AiDraftNote[];
};
export type TranscriptionRequest = {
  projectId: string;
  assetId: string;
  stemId?: string;
  importedStemId?: string;
  tuningMidi: number[];
  syncAnchors: SyncAnchor[];
  grid: number;
};
function validInputSource(request: TranscriptionRequest) {
  return (
    (request.stemId === undefined || isUuid(request.stemId)) &&
    (request.importedStemId === undefined || isUuid(request.importedStemId)) &&
    !(request.stemId !== undefined && request.importedStemId !== undefined)
  );
}
function invalid(): never {
  throw new Error('AI_OUTPUT_INVALID');
}
function exact(value: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}
function fingering(value: unknown): Fingering {
  if (
    !isRecord(value) ||
    !exact(value, ['stringIndex', 'fret']) ||
    !isSafeUnsigned(value.stringIndex, 6) ||
    value.stringIndex < 1 ||
    !isSafeUnsigned(value.fret, 24)
  )
    return invalid();
  return { stringIndex: value.stringIndex, fret: value.fret };
}
function review(value: unknown): value is ReviewReason {
  return typeof value === 'string' && Object.hasOwn(reviewLabels, value);
}
export function decodeAiDraft(
  value: unknown,
  request: TranscriptionRequest,
): AiDraft {
  if (
    !validInputSource(request) ||
    !isRecord(value) ||
    !exact(value, [
      'schemaVersion',
      'projectId',
      'assetId',
      'inputSha256',
      'modelId',
      'modelVersion',
      'status',
      'confidenceMeaning',
      'durationMs',
      'notes',
      ...(request.stemId ? ['stemId'] : []),
      ...(request.importedStemId ? ['importedStemId'] : []),
    ]) ||
    value.schemaVersion !== 1 ||
    value.projectId !== request.projectId ||
    value.assetId !== request.assetId ||
    (request.stemId !== undefined &&
      (!isUuid(request.stemId) || value.stemId !== request.stemId)) ||
    (request.importedStemId !== undefined &&
      value.importedStemId !== request.importedStemId) ||
    typeof value.inputSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.inputSha256) ||
    value.modelId !== 'basic-pitch' ||
    value.modelVersion !== '0.4.0' ||
    value.status !== 'AI_DRAFT' ||
    value.confidenceMeaning !== 'MEAN_NOTE_ACTIVATION' ||
    !isNumberWithin(value.durationMs, 0.001, 60000) ||
    !Array.isArray(value.notes) ||
    !value.notes.length ||
    value.notes.length > 2000
  )
    return invalid();
  const duration = value.durationMs;
  const notes = value.notes.map<AiDraftNote>((n: unknown) => {
    if (
      !isRecord(n) ||
      !exact(n, [
        'onsetMs',
        'offsetMs',
        'pitchMidi',
        'confidence',
        'startTick',
        'durationTicks',
        'candidates',
        'fingering',
        'reviewReasons',
        'source',
      ]) ||
      !isNumberWithin(n.onsetMs, 0, duration) ||
      !isNumberWithin(n.offsetMs, 0, duration + 50) ||
      n.offsetMs <= n.onsetMs ||
      !isSafeUnsigned(n.pitchMidi, 127) ||
      !isNumberWithin(n.confidence, 0, 1) ||
      !isSafeUnsigned(n.startTick, 100000000) ||
      !isSafeUnsigned(n.durationTicks, 100000000 - n.startTick) ||
      !n.durationTicks ||
      n.startTick % request.grid !== 0 ||
      n.durationTicks % request.grid !== 0 ||
      !Array.isArray(n.candidates) ||
      n.candidates.length > 6 ||
      !Array.isArray(n.reviewReasons) ||
      !n.reviewReasons.every(review) ||
      new Set(n.reviewReasons).size !== n.reviewReasons.length ||
      n.source !== 'ai'
    )
      return invalid();
    const candidates = n.candidates.map((c: unknown) => fingering(c));
    if (
      new Set(candidates.map((c) => c.stringIndex)).size !==
        candidates.length ||
      candidates.some(
        (c) =>
          (request.tuningMidi[c.stringIndex - 1] ?? -100) + c.fret !==
          n.pitchMidi,
      )
    )
      return invalid();
    const selected = n.fingering === null ? null : fingering(n.fingering);
    if (
      selected &&
      (!candidates.some(
        (c) =>
          c.stringIndex === selected.stringIndex && c.fret === selected.fret,
      ) ||
        n.reviewReasons.includes('POLYPHONY'))
    )
      return invalid();
    if (
      (n.confidence < 0.7 && !n.reviewReasons.includes('LOW_CONFIDENCE')) ||
      (!candidates.length && !n.reviewReasons.includes('OUT_OF_RANGE'))
    )
      return invalid();
    return {
      onsetMs: n.onsetMs,
      offsetMs: n.offsetMs,
      pitchMidi: n.pitchMidi,
      confidence: n.confidence,
      startTick: n.startTick,
      durationTicks: n.durationTicks,
      candidates,
      fingering: selected,
      reviewReasons: n.reviewReasons,
      source: 'ai',
    };
  });
  if (notes.some((n, i) => i > 0 && n.onsetMs < (notes[i - 1]?.onsetMs ?? 0)))
    return invalid();
  return {
    schemaVersion: 1,
    projectId: request.projectId,
    assetId: request.assetId,
    ...(request.stemId ? { stemId: request.stemId } : {}),
    ...(request.importedStemId
      ? { importedStemId: request.importedStemId }
      : {}),
    inputSha256: value.inputSha256,
    modelId: 'basic-pitch',
    modelVersion: '0.4.0',
    status: 'AI_DRAFT',
    confidenceMeaning: 'MEAN_NOTE_ACTIVATION',
    durationMs: duration,
    notes,
  };
}
export function draftPreview(session: ScoreSession, draft: AiDraft) {
  const base = prepareEditingDocument(session);
  const index = getActiveTrackIndex(session),
    track = base.tracks[index];
  if (!track || draft.notes.some((n) => !n.fingering))
    throw new Error(
      '미지원 화음/운지는 아래 표에서 검토하세요. 원본 악보는 유지합니다.',
    );
  const notes = draft.notes.map((n) => ({
    id: crypto.randomUUID(),
    trackId: track.id,
    measureIndex: 0,
    startTick: n.startTick,
    durationTicks: n.durationTicks,
    pitchMidi: n.pitchMidi,
    stringIndex: n.fingering?.stringIndex,
    fret: n.fingering?.fret,
    source: 'ai' as const,
  }));
  const document = {
    ...base,
    renderSource: 'NORMALIZED' as const,
    tracks: base.tracks.map((t, i) => (i === index ? { ...t, notes } : t)),
  };
  const bars = editorBars(document);
  notes.forEach((n) => {
    n.measureIndex = bars.findIndex(
      (b) => b.start <= n.startTick && n.startTick < b.end,
    );
  });
  return { ...renderNormalized(document), document, trackIndex: index };
}
export const transcriptionApi = {
  available: isTauri,
  async restore(request: TranscriptionRequest, signal: AbortSignal) {
    if (!validInputSource(request)) throw new Error('AI_INPUT_INVALID');
    const value = await runStorageJob(
      'restore_transcription_draft',
      request,
      signal,
      () => undefined,
    );
    if (
      !isRecord(value) ||
      !exact(value, ['schemaVersion', 'draft']) ||
      value.schemaVersion !== 1
    )
      return invalid();
    return value.draft === null ? null : decodeAiDraft(value.draft, request);
  },
  async analyze(request: TranscriptionRequest, signal: AbortSignal) {
    if (!validInputSource(request)) throw new Error('AI_INPUT_INVALID');
    return decodeAiDraft(
      await runStorageJob(
        'transcribe_project_audio',
        request,
        signal,
        () => undefined,
      ),
      request,
    );
  },
};
export function transcriptionError(cause: unknown) {
  const code = cause instanceof Error ? cause.message : '';
  const messages: Record<string, string> = {
    AI_MODEL_MISSING:
      '사용할 수 있는 Basic Pitch 로컬 환경이 없습니다. 환경 설정의 AI 모델 설치 관리에서 설치 / 재검증하세요.',
    AI_MODEL_VERSION: '모델 환경의 패키지 버전이 고정 계획과 다릅니다.',
    AI_MODEL_INTEGRITY:
      '모델 무결성 검사가 실패했습니다. 손상 모델은 실행하지 않았습니다.',
    AI_INPUT_INVALID:
      '60초/64MiB 이하의 PCM16/float32 mono/stereo WAV를 선택하세요.',
    AI_OUTPUT_INVALID: '모델 출력 검증에 실패했습니다. 원본은 유지합니다.',
    AI_TRANSCRIPTION_EMPTY:
      '음표를 찾지 못했습니다. 침묵이나 다른 입력을 확인하세요.',
    AI_SEPARATION_EMPTY: '분리할 소리가 없는 입력입니다.',
    AI_STEM_LIMIT:
      '프로젝트의 분리 결과 보존 한도20개에 도달했습니다. 기존 결과는 유지했습니다.',
    AI_STEM_NOT_FOUND:
      '저장된 전체 기타 분리 결과가 없습니다. 먼저 별도 분리 기능으로 저장해주세요.',
    IMPORTED_STEM_NOT_FOUND:
      '선택한 사용자 기타 파일이 이 프로젝트에 없습니다. 목록을 다시 읽어주세요.',
    IMPORTED_STEM_INVALID:
      '사용자 기타 파일의 WAV 형식·길이·저장 무결성을 확인하세요. 원본은 유지합니다.',
    AI_WORKER_TIMEOUT: '분석 시간이 초과되어 작업을 종료했습니다.',
    AI_DRAFT_LIMIT:
      '프로젝트의 초안 보존 한도100개에 도달했습니다. 기존 초안은 유지했습니다.',
    STORAGE_BUSY: '다른 파일 작업을 끝낸 뒤 다시 분석하세요.',
    RECORDING_BUSY: '녹음을 저장한 뒤 분석하세요.',
  };
  return (
    messages[code] ??
    'AI 작업을 완료하지 못했습니다. 원본 악보/음원은 유지했습니다.'
  );
}
