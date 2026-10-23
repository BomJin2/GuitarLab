import { afterEach, expect, it, vi } from 'vitest';
import { runStorageJob } from '../library/projects';
import { decodeModelCache, modelCacheApi } from './modelCache';
vi.mock('../library/projects', () => ({ runStorageJob: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const info = {
  schemaVersion: 1,
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  state: 'CACHE_VERIFIED',
  artifactCount: 41,
  totalBytes: 144366287,
  reusedFiles: 0,
};
it('동의 없이는 native를 호출하지 않고 허용된 요청만 보낸다', async () => {
  const signal = new AbortController().signal;
  await expect(
    modelCacheApi.download(false, signal, () => undefined),
  ).rejects.toThrow('AI_DOWNLOAD_CONSENT_REQUIRED');
  expect(runStorageJob).not.toHaveBeenCalled();
  vi.mocked(runStorageJob).mockResolvedValue(info);
  expect(await modelCacheApi.download(true, signal, () => undefined)).toEqual(
    info,
  );
  expect(runStorageJob).toHaveBeenCalledWith(
    'download_ai_model',
    { modelId: 'basic-pitch', downloadConsent: true },
    signal,
    expect.any(Function),
    { waitForCancellation: true },
  );
});
it('설치 완료 위조·다른 총량/모델·임의 경로·부정확한 재사용 수는 거부한다', () => {
  expect(
    decodeModelCache({
      ...info,
      artifactCount: 42,
      totalBytes: 146364006,
      reusedFiles: 42,
    }).artifactCount,
  ).toBe(42);
  for (const wrong of [
    { ...info, state: 'INSTALLED' },
    { ...info, totalBytes: 1 },
    { ...info, artifactCount: 42 },
    { ...info, totalBytes: 146364006 },
    { ...info, reusedFiles: 42 },
    { ...info, reusedFiles: 0.5 },
    { ...info, path: 'private' },
    { ...info, modelId: 'htdemucs_6s' },
  ]) {
    expect(() => decodeModelCache(wrong)).toThrow('AI_PROTOCOL_INVALID');
  }
});

it('Demucs는 선택한 모델·버전·ABI별 정확한 총량만 허용한다', async () => {
  const demucs = {
    ...info,
    modelId: 'htdemucs_6s',
    modelVersion: '4.1.0',
    artifactCount: 34,
    totalBytes: 708033316,
    reusedFiles: 34,
  };
  expect(decodeModelCache(demucs, 'htdemucs_6s')).toEqual(demucs);
  expect(
    decodeModelCache(
      { ...demucs, artifactCount: 33, totalBytes: 707117623, reusedFiles: 33 },
      'htdemucs_6s',
    ).artifactCount,
  ).toBe(33);
  for (const invalid of [
    info,
    { ...demucs, artifactCount: 33 },
    { ...demucs, totalBytes: 707117623 },
    { ...demucs, reusedFiles: 35 },
    { ...demucs, modelVersion: '0.4.0' },
  ]) {
    expect(() => decodeModelCache(invalid, 'htdemucs_6s')).toThrow(
      'AI_PROTOCOL_INVALID',
    );
  }
  vi.mocked(runStorageJob).mockResolvedValue(demucs);
  const signal = new AbortController().signal;
  expect(
    await modelCacheApi.download(true, signal, () => undefined, 'htdemucs_6s'),
  ).toEqual(demucs);
  expect(runStorageJob).toHaveBeenCalledWith(
    'download_ai_model',
    { modelId: 'htdemucs_6s', downloadConsent: true },
    signal,
    expect.any(Function),
    { waitForCancellation: true },
  );
});
