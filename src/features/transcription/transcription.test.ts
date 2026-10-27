import { expect, it, vi } from 'vitest';
import { decodeAiDraft, draftPreview, transcriptionApi } from './transcription';
import {
  transcriptionFixture,
  transcriptionRequest,
} from '../../test/transcriptionFixture';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { runStorageJob } from '../library/projects';
vi.mock('../library/projects', async (original) => ({
  ...(await original<typeof import('../library/projects')>()),
  runStorageJob: vi.fn(),
}));

it('사용자 기타 입력의 ID·응답을 분리하고 잘못된 조합은 IPC 전에 거부한다', async () => {
  const importedStemId = '00000000-0000-4000-8000-000000000040';
  const request = { ...transcriptionRequest, importedStemId };
  const draft = {
    ...transcriptionFixture(),
    importedStemId,
    inputSha256: 'd'.repeat(64),
  };
  expect(decodeAiDraft(draft, request)).toEqual(draft);
  for (const [value, context] of [
    [draft, transcriptionRequest],
    [transcriptionFixture(), request],
    [{ ...draft, importedStemId: crypto.randomUUID() }, request],
    [draft, { ...request, stemId: importedStemId }],
  ] as const)
    expect(() => decodeAiDraft(value, context)).toThrow('AI_OUTPUT_INVALID');
  const signal = new AbortController().signal;
  vi.mocked(runStorageJob).mockResolvedValueOnce(draft);
  expect(await transcriptionApi.analyze(request, signal)).toEqual(draft);
  vi.mocked(runStorageJob).mockResolvedValueOnce({ schemaVersion: 1, draft });
  expect(await transcriptionApi.restore(request, signal)).toEqual(draft);
  const before = vi.mocked(runStorageJob).mock.calls.length;
  await expect(
    transcriptionApi.analyze({ ...request, stemId: importedStemId }, signal),
  ).rejects.toThrow('AI_INPUT_INVALID');
  await expect(
    transcriptionApi.restore(
      { ...request, importedStemId: '../file.wav' },
      signal,
    ),
  ).rejects.toThrow('AI_INPUT_INVALID');
  expect(runStorageJob).toHaveBeenCalledTimes(before);
});

it('STEM 입력과 원본 응답을 분리하고 정확한 UUID를 분석·복원에 전달한다', async () => {
  const stemId = '00000000-0000-4000-8000-000000000099';
  const request = { ...transcriptionRequest, stemId };
  const draft = {
    ...transcriptionFixture(),
    stemId,
    inputSha256: 'b'.repeat(64),
  };
  expect(decodeAiDraft(draft, request)).toEqual(draft);
  for (const [value, context] of [
    [draft, transcriptionRequest],
    [transcriptionFixture(), request],
    [{ ...draft, stemId: crypto.randomUUID() }, request],
    [draft, { ...request, stemId: '../path' }],
  ] as const)
    expect(() => decodeAiDraft(value, context)).toThrow('AI_OUTPUT_INVALID');
  const signal = new AbortController().signal;
  vi.mocked(runStorageJob).mockResolvedValueOnce(draft);
  expect(await transcriptionApi.analyze(request, signal)).toEqual(draft);
  expect(runStorageJob).toHaveBeenLastCalledWith(
    'transcribe_project_audio',
    request,
    signal,
    expect.any(Function),
  );
  vi.mocked(runStorageJob).mockResolvedValueOnce({ schemaVersion: 1, draft });
  expect(await transcriptionApi.restore(request, signal)).toEqual(draft);
});

it('저장 초안을 모델 실행 없이 읽고 빈 결과·손상 envelope를 구분한다', async () => {
  const signal = new AbortController().signal;
  vi.mocked(runStorageJob).mockResolvedValueOnce({
    schemaVersion: 1,
    draft: transcriptionFixture(),
  });
  expect(
    (await transcriptionApi.restore(transcriptionRequest, signal))?.notes,
  ).toEqual(transcriptionFixture().notes);
  expect(runStorageJob).toHaveBeenLastCalledWith(
    'restore_transcription_draft',
    transcriptionRequest,
    signal,
    expect.any(Function),
  );
  vi.mocked(runStorageJob).mockResolvedValueOnce({
    schemaVersion: 1,
    draft: null,
  });
  expect(
    await transcriptionApi.restore(transcriptionRequest, signal),
  ).toBeNull();
  vi.mocked(runStorageJob).mockResolvedValueOnce({
    schemaVersion: 1,
    draft: null,
    path: 'private',
  });
  await expect(
    transcriptionApi.restore(transcriptionRequest, signal),
  ).rejects.toThrow('AI_OUTPUT_INVALID');
});

it('실제 IPC 초안을 검증하며 경로 없이 프로젝트 자산과 튜닝·앵커만 전달한다', async () => {
  vi.mocked(runStorageJob).mockResolvedValue(transcriptionFixture());
  const signal = new AbortController().signal;
  expect(
    (await transcriptionApi.analyze(transcriptionRequest, signal)).notes[0]
      ?.pitchMidi,
  ).toBe(67);
  expect(runStorageJob).toHaveBeenCalledWith(
    'transcribe_project_audio',
    transcriptionRequest,
    signal,
    expect.any(Function),
  );
});
it('다른 자산·위조 음정/운지·저신뢰 누락·비유한 값·미지원 버전·추가 필드를 거부한다', () => {
  const wrongPitch = transcriptionFixture();
  wrongPitch.notes[0]!.pitchMidi = 68;
  const noReason = transcriptionFixture();
  noReason.notes[0]!.reviewReasons = [];
  const badTime = transcriptionFixture();
  badTime.notes[0]!.onsetMs = NaN;
  const poly = transcriptionFixture();
  poly.notes[0]!.reviewReasons.push('POLYPHONY');
  const reordered = transcriptionFixture();
  reordered.notes.push({ ...reordered.notes[0]!, onsetMs: 0 });
  for (const value of [
    wrongPitch,
    noReason,
    badTime,
    poly,
    reordered,
    { ...transcriptionFixture(), assetId: crypto.randomUUID() },
    { ...transcriptionFixture(), schemaVersion: 2 },
    { ...transcriptionFixture(), path: 'private' },
  ])
    expect(() => decodeAiDraft(value, transcriptionRequest)).toThrow(
      'AI_OUTPUT_INVALID',
    );
});
it('실제 alphaTab에 별도 AI TAB를 렌더하며 원본 바이트·문서·채점 대상은 바꾸지 않는다', () => {
  const session = scoreEditingFixture(),
    before = JSON.stringify(session.document),
    bytes = session.originalBytes.slice();
  const preview = draftPreview(session, transcriptionFixture());
  expect(
    preview.score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0]
      ?.fret,
  ).toBe(3);
  expect(preview.document.tracks[0]?.notes[0]?.source).toBe('ai');
  expect(JSON.stringify(session.document)).toBe(before);
  expect(session.originalBytes).toEqual(bytes);
  const poly = transcriptionFixture();
  poly.notes[0]!.fingering = null;
  poly.notes[0]!.reviewReasons.push('POLYPHONY');
  expect(() => draftPreview(session, poly)).toThrow('미지원 화음/운지');
});
