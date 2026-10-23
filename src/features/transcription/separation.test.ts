import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { decodeSeparation, separationApi } from './separation';
import {
  separationFixture,
  separationRequest,
} from '../../test/separationFixture';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.resetAllMocks());
it('분리 결과의 문맥·역할·길이·모델·추가 필드를 거부한다', () => {
  expect(decodeSeparation(separationFixture(), separationRequest)).toEqual(
    separationFixture(),
  );
  for (const changed of [
    { projectId: separationRequest.assetId },
    { stemSetId: '../outside' },
    { createdAtMs: -1 },
    { modelVersion: 'other' },
    { weightsSha256: 'a'.repeat(64) },
    { frames: 1 },
    { startOffsetMs: 1 },
    { path: 'private' },
    { stems: [] },
    {
      stems: separationFixture().stems.map((s, index) => ({
        ...s,
        role: index === 0 ? 'LEAD' : 'RHYTHM',
      })),
    },
    { stems: [...separationFixture().stems].reverse() },
    {
      stems: separationFixture().stems.map((s) => ({
        ...s,
        id: separationFixture().stems[0]?.id,
      })),
    },
    { stems: separationFixture().stems.map((s) => ({ ...s, peak: Infinity })) },
  ])
    expect(() =>
      decodeSeparation(
        { ...separationFixture(), ...changed },
        separationRequest,
      ),
    ).toThrow('AI_OUTPUT_INVALID');
});
it('저장 결과는 재분석 없이 읽고 빈 결과·손상 envelope를 구분한다', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    ...completed(),
    result: { schemaVersion: 1, separation: null },
  });
  expect(
    await separationApi.restore(
      separationRequest,
      new AbortController().signal,
    ),
  ).toBeNull();
  expect(invoke).toHaveBeenLastCalledWith('restore_project_separation', {
    request: { schemaVersion: 1, ...separationRequest },
  });
  expect(invoke).toHaveBeenCalledTimes(1);
  vi.mocked(invoke)
    .mockResolvedValueOnce({
      ...completed(),
      result: { schemaVersion: 1, separation: separationFixture() },
    })
    .mockResolvedValueOnce(new ArrayBuffer(120));
  expect(
    (
      await separationApi.restore(
        separationRequest,
        new AbortController().signal,
      )
    )?.info.stemSetId,
  ).toBe(separationFixture().stemSetId);
  vi.mocked(invoke).mockResolvedValueOnce({
    ...completed(),
    result: { schemaVersion: 1, separation: null, path: 'unexpected' },
  });
  await expect(
    separationApi.restore(separationRequest, new AbortController().signal),
  ).rejects.toThrow('AI_OUTPUT_INVALID');
});
function completed() {
  return {
    schemaVersion: 1,
    jobId: separationRequest.assetId,
    state: 'COMPLETED',
    completedBytes: 0,
    totalBytes: 0,
    result: separationFixture(),
    errorCode: null,
  };
}
it('완료한 작업의 binary를 단발 소비하고 두 WAV 길이로 분할한다', async () => {
  const data = new ArrayBuffer(120);
  new Uint8Array(data).fill(1, 0, 60);
  new Uint8Array(data).fill(2, 60);
  vi.mocked(invoke)
    .mockResolvedValueOnce(completed())
    .mockResolvedValueOnce(data);
  const result = await separationApi.analyze(
    separationRequest,
    new AbortController().signal,
  );
  expect(
    result.audio.map((a) => [
      a.role,
      a.bytes.byteLength,
      new Uint8Array(a.bytes)[0],
    ]),
  ).toEqual([
    ['GUITAR_FULL', 60, 1],
    ['ACCOMPANIMENT', 60, 2],
  ]);
  expect(invoke).toHaveBeenLastCalledWith('take_storage_bytes', {
    request: { schemaVersion: 1, jobId: separationRequest.assetId },
  });
});
it('잘못된 binary 길이·기존 취소·native 오류를 성공으로 표시하지 않는다', async () => {
  vi.mocked(invoke)
    .mockResolvedValueOnce(completed())
    .mockResolvedValueOnce(new ArrayBuffer(119));
  await expect(
    separationApi.analyze(separationRequest, new AbortController().signal),
  ).rejects.toThrow('AI_OUTPUT_INVALID');
  vi.mocked(invoke).mockRejectedValueOnce(new Error('AI_MODEL_MISSING'));
  await expect(
    separationApi.analyze(separationRequest, new AbortController().signal),
  ).rejects.toThrow('AI_MODEL_MISSING');
  const controller = new AbortController();
  controller.abort();
  vi.mocked(invoke).mockClear();
  await expect(
    separationApi.analyze(separationRequest, controller.signal),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
