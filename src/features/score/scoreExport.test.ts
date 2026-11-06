import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  exportLossWarnings,
  scoreExportApi,
  scoreExportError,
} from './scoreExport';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { scoreCapacityFixture } from '../../test/scoreCapacityFixture';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import { importScore, normalizeScore } from './alphaTabAdapter';
import { importer } from '@coderline/alphatab';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));

it('작업 Error와 native 오류 객체는 같은 구체적 복구 안내를 제공하고 경로를 숨긴다', () => {
  for (const [code, expected] of [
    ['EXPORT_DESTINATION_EXISTS', '새 파일명을 선택하세요'],
    ['STORAGE_BUSY', '다른 파일 작업'],
    ['RECORDING_BUSY', '녹음을 저장한 뒤'],
    ['DISK_SPACE_LOW', '저장 공간이 부족'],
    ['SCORE_XML_LIMIT', '트랙 또는 마디 수를 줄이세요'],
  ]) {
    expect(scoreExportError(new Error(code))).toContain(expected);
    expect(scoreExportError({ code })).toContain(expected);
  }
  expect(scoreExportError(new Error('C:/private/score.json'))).not.toContain(
    'private',
  );
});
afterEach(() => vi.resetAllMocks());
it('용량을 넘는 파생 악보는 JSON/XML 모두 파일 선택과 IPC 전에 거부한다', async () => {
  const document = scoreCapacityFixture(128, 32, 1);
  const before = JSON.stringify(document);
  for (const format of ['JSON', 'MUSICXML'] as const) {
    await expect(
      scoreExportApi.export(
        document,
        format,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow('SCORE_XML_LIMIT');
  }
  expect(invoke).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
});
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
it('GP7은 ZIP 바이트로 보내고 다시 읽으면 v2 주법과 데드 음 운지를 유지한다', async () => {
  const document = normalizeScore(
    importer.ScoreLoader.loadAlphaTex(
      '. 0.1{h}.4 2.1.4 3.2{sl}.4 5.2.4 | 7.3{x}.4 2.3{ss}.4 4.3.4 12.4{nh lr}.4',
    ),
  );
  // AlphaTex x는 프렛을 0으로 읽으므로 데드 음 운지(7프렛)를 직접 넣습니다.
  const dead = document.tracks[0]!.notes[4]!;
  document.tracks[0]!.notes[4] = { ...dead, fret: 7, pitchMidi: 62 };
  vi.mocked(invoke).mockResolvedValueOnce(complete('GP7'));
  await scoreExportApi.export(
    document,
    'GP7',
    new AbortController().signal,
    vi.fn(),
  );
  const call = vi.mocked(invoke).mock.calls[0]?.[1] as {
    request: { format: string; gp7: number[]; musicXml?: string };
  };
  expect(call.request.format).toBe('GP7');
  expect(call.request.musicXml).toBeUndefined();
  expect(call.request.gp7.slice(0, 4)).toEqual([0x50, 0x4b, 3, 4]);
  const back = normalizeScore(importScore(Uint8Array.from(call.request.gp7)));
  const shape = (d: typeof document) =>
    d.tracks[0]!.notes.map((n) => [n.fret, n.techniques ?? null]);
  expect(shape(back)).toEqual(shape(document));
  expect(shape(back)[4]).toEqual([7, ['DEAD']]);
});
it('계산 전 양보 사이에 취소하면 악보를 그리지 않고 저장 요청 없이 취소한다', async () => {
  const controller = new AbortController();
  // 그리면 실패하는 문서라, 양보 뒤 취소 확인이 없으면 다른 오류가 납니다.
  const broken = { ...scoreEditingFixture().document, tracks: [] };
  const pending = scoreExportApi.export(
    broken,
    'GP7',
    controller.signal,
    vi.fn(),
  );
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(invoke).not.toHaveBeenCalled();
});
it('스윙 소리 시각이 있는 악보는 GP7로 내보내지 않고 이유를 알리며, 손실 안내를 보여 준다', async () => {
  const document = structuredClone(scoreEditingFixture().document);
  const note = document.tracks[0]!.notes[1]!;
  note.playbackTick = note.startTick + Math.floor(note.durationTicks / 3);
  await expect(
    scoreExportApi.export(
      document,
      'GP7',
      new AbortController().signal,
      vi.fn(),
    ),
  ).rejects.toThrow('SCORE_GP7_SWING');
  expect(invoke).not.toHaveBeenCalled();
  expect(scoreExportError(new Error('SCORE_GP7_SWING'))).toContain('JSON');
  expect(exportLossWarnings(document)).toEqual([
    expect.stringContaining('스윙 소리 시각'),
  ]);
});
