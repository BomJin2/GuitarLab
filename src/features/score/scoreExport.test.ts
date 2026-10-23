import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { scoreExportApi } from './scoreExport';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import { importScore, normalizeScore } from './alphaTabAdapter';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.resetAllMocks());
function complete(format: string) {
  return {
    schemaVersion: 1,
    jobId: '00000000-0000-4000-8000-000000000001',
    state: 'COMPLETED',
    completedBytes: 100,
    totalBytes: 100,
    errorCode: null,
    result: { schemaVersion: 1, format, bytes: 100 },
  };
}
it('새 JSON은 문서 계약으로, MusicXML은 실제 재입력에서 음표 의미를 유지한다', async () => {
  const document = scoreEditingFixture().document;
  vi.mocked(invoke)
    .mockResolvedValueOnce(complete('JSON'))
    .mockResolvedValueOnce(complete('MUSICXML'));
  const controller = new AbortController();
  await scoreExportApi.export(document, 'JSON', controller.signal, vi.fn());
  const first = vi.mocked(invoke).mock.calls[0]?.[1];
  expect(first).toMatchObject({
    request: { format: 'JSON', document: { renderSource: 'NORMALIZED' } },
  });
  if (!first || !('request' in first)) throw new Error('테스트 요청 필요');
  const request: unknown = first.request;
  if (
    typeof request !== 'object' ||
    request === null ||
    !('document' in request)
  )
    throw new Error('테스트 문서 필요');
  expect(
    decodeScoreDocument(JSON.parse(JSON.stringify(request.document))).tracks,
  ).toEqual(document.tracks);
  await scoreExportApi.export(document, 'MUSICXML', controller.signal, vi.fn());
  const second = vi.mocked(invoke).mock.calls[1]?.[1];
  if (!second || !('request' in second)) throw new Error('테스트 요청 필요');
  const xmlRequest: unknown = second.request;
  if (
    typeof xmlRequest !== 'object' ||
    xmlRequest === null ||
    !('musicXml' in xmlRequest) ||
    typeof xmlRequest.musicXml !== 'string'
  )
    throw new Error('테스트 XML 필요');
  const restored = normalizeScore(
    importScore(new TextEncoder().encode(xmlRequest.musicXml)),
  );
  expect(
    restored.tracks[0]?.notes.map((n) => [
      n.startTick,
      n.durationTicks,
      n.pitchMidi,
      n.stringIndex,
      n.fret,
    ]),
  ).toEqual(
    document.tracks[0]?.notes.map((n) => [
      n.startTick,
      n.durationTicks,
      n.pitchMidi,
      n.stringIndex,
      n.fret,
    ]),
  );
});
it('취소된 요청과 다른 출력 포맷/크기를 정상 출력으로 취급하지 않는다', async () => {
  const document = scoreEditingFixture().document;
  const canceled = new AbortController();
  canceled.abort();
  await expect(
    scoreExportApi.export(document, 'JSON', canceled.signal, vi.fn()),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  vi.mocked(invoke).mockResolvedValueOnce(complete('MUSICXML'));
  await expect(
    scoreExportApi.export(
      document,
      'JSON',
      new AbortController().signal,
      vi.fn(),
    ),
  ).rejects.toThrow('SCORE_EXPORT_CONTRACT_INVALID');
});
