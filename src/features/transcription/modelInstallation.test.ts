import { afterEach, expect, it, vi } from 'vitest';
import { runStorageJob } from '../library/projects';
import {
  decodeModelInstallation,
  modelInstallationApi,
} from './modelInstallation';
vi.mock('../library/projects', () => ({ runStorageJob: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const report = {
  schemaVersion: 1,
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  pythonVersion: '3.10.8',
  state: 'FILES_VERIFIED',
};
it('설치 확인은 고정 모델만 전달하며 결과 ID·버전·필드를 엄격히 검사한다', async () => {
  vi.mocked(runStorageJob).mockResolvedValue(report);
  const signal = new AbortController().signal;
  expect(await modelInstallationApi.verify('basic-pitch', signal)).toEqual(
    report,
  );
  expect(runStorageJob).toHaveBeenCalledWith(
    'verify_ai_model',
    { modelId: 'basic-pitch' },
    signal,
    expect.any(Function),
  );
  expect(() => decodeModelInstallation(report, 'htdemucs_6s')).toThrow(
    'AI_PROTOCOL_INVALID',
  );
  expect(
    decodeModelInstallation(
      { ...report, pythonVersion: '3.12.15' },
      'basic-pitch',
    ).pythonVersion,
  ).toBe('3.12.15');
  for (const value of [
    { ...report, modelVersion: 'other' },
    { ...report, state: 'READY' },
    { ...report, usable: true },
    { ...report, pythonVersion: 'C:/private' },
    { ...report, pythonVersion: '3.12.14' },
    { ...report, pythonVersion: '3.12.16' },
    { ...report, pythonVersion: '3.11.15' },
    { ...report, schemaVersion: 2 },
  ]) {
    expect(() => decodeModelInstallation(value, 'basic-pitch')).toThrow(
      'AI_PROTOCOL_INVALID',
    );
  }
});
