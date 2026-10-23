import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { runStorageJob } from '../library/projects';
import {
  decodeImportedStem,
  importedStemsApi,
  type ImportedGuitarStem,
} from './importedStems';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
vi.mock('../library/projects', async (original) => ({
  ...(await original<typeof import('../library/projects')>()),
  runStorageJob: vi.fn(),
}));
const projectId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const stem: ImportedGuitarStem = {
  schemaVersion: 1,
  id,
  projectId,
  name: '자체 음원.wav',
  role: 'LEAD',
  origin: 'USER_IMPORTED',
  sampleRate: 48000,
  channels: 1,
  frames: 2,
  durationMs: (2 * 1000) / 48000,
  bytes: 52,
  sha256: 'a'.repeat(64),
  peak: 0.5,
  createdAtMs: 1,
};
beforeEach(() => vi.clearAllMocks());
it('사용자 제공 원본과 실제 유한한 WAV 메타데이터만 표시한다', () => {
  expect(decodeImportedStem(stem, projectId)).toEqual(stem);
  for (const bad of [
    null,
    {},
    { ...stem, path: 'private' },
    { ...stem, schemaVersion: 2 },
    { ...stem, projectId: id },
    { ...stem, origin: 'AI_ESTIMATE' },
    { ...stem, role: 'AI_LEAD' },
    { ...stem, name: 'x\n' },
    { ...stem, frames: 0 },
    { ...stem, channels: 3 },
    { ...stem, durationMs: 4000 },
    { ...stem, sha256: 'bad' },
    { ...stem, peak: NaN },
  ])
    expect(() => decodeImportedStem(bad, projectId)).toThrow(
      'IMPORTED_STEM_CONTRACT_INVALID',
    );
});
it('선택·조회·단발 binary의 문맥과 크기를 검증하고 취소 결과를 버린다', async () => {
  const controller = new AbortController();
  const progress = vi.fn();
  vi.mocked(runStorageJob).mockResolvedValue({ schemaVersion: 1, stem });
  expect(
    await importedStemsApi.import(
      projectId,
      'LEAD',
      controller.signal,
      progress,
    ),
  ).toEqual(stem);
  expect(runStorageJob).toHaveBeenLastCalledWith(
    'import_guitar_stem',
    { projectId, role: 'LEAD' },
    controller.signal,
    progress,
    { waitForCancellation: true },
  );
  await expect(
    importedStemsApi.import(projectId, 'RHYTHM', controller.signal, progress),
  ).rejects.toThrow();
  vi.mocked(runStorageJob).mockResolvedValue({
    schemaVersion: 1,
    projectId,
    stems: [stem, stem],
  });
  await expect(
    importedStemsApi.list(projectId, controller.signal, progress),
  ).rejects.toThrow();
  vi.mocked(runStorageJob).mockImplementation(
    async (_command, _request, _signal, onProgress) => {
      onProgress({
        schemaVersion: 1,
        jobId: id,
        state: 'COMPLETED',
        completedBytes: 52,
        totalBytes: 52,
        result: { schemaVersion: 1, stem },
        errorCode: null,
      });
      return { schemaVersion: 1, stem };
    },
  );
  vi.mocked(invoke).mockResolvedValue(new ArrayBuffer(52));
  expect(
    (await importedStemsApi.read(projectId, id, controller.signal, progress))
      .bytes.byteLength,
  ).toBe(52);
  vi.mocked(invoke).mockResolvedValue(new ArrayBuffer(51));
  await expect(
    importedStemsApi.read(projectId, id, controller.signal, progress),
  ).rejects.toThrow();
  controller.abort();
  await expect(
    importedStemsApi.read(projectId, id, controller.signal, progress),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
