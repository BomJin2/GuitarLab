import { afterEach, expect, it, vi } from 'vitest';
import { runStorageJob } from '../library/projects';
import { decodeModelSetup, modelSetupApi } from './modelSetup';
vi.mock('../library/projects', async (original) => ({
  ...(await original<typeof import('../library/projects')>()),
  runStorageJob: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());
const report = {
  schemaVersion: 1,
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  environmentId: '12345678-1234-4234-8234-123456789012',
  state: 'INSTALLED',
  selfTest: 'OWNED_8_NOTES_PASSED',
};
it('고정 설치 요청만 보내고 정확한 자체 검증 결과·UUID를 요구한다', async () => {
  vi.mocked(runStorageJob).mockResolvedValue(report);
  const signal = new AbortController().signal;
  expect(await modelSetupApi.install(signal, () => undefined)).toEqual(report);
  expect(runStorageJob).toHaveBeenCalledWith(
    'install_ai_model',
    { modelId: 'basic-pitch' },
    signal,
    expect.any(Function),
    { waitForCancellation: true },
  );
  for (const value of [
    { ...report, state: 'READY' },
    { ...report, environmentId: '../private' },
    { ...report, schemaVersion: 2 },
    { ...report, path: 'private' },
    { ...report, selfTest: 'NOT_TESTED' },
    { ...report, modelId: 'htdemucs_6s' },
    { ...report, modelVersion: '1.0' },
  ])
    expect(() => decodeModelSetup(value)).toThrow('AI_PROTOCOL_INVALID');
  expect(decodeModelSetup({ ...report, state: 'ALREADY_ACTIVE' }).state).toBe(
    'ALREADY_ACTIVE',
  );
  const demucs = {
    ...report,
    modelId: 'htdemucs_6s',
    modelVersion: '4.1.0',
    selfTest: 'OWNED_STEM_SPLIT_PASSED',
  };
  expect(() => decodeModelSetup(demucs)).toThrow('AI_PROTOCOL_INVALID');
  expect(() => decodeModelSetup(report, 'htdemucs_6s')).toThrow(
    'AI_PROTOCOL_INVALID',
  );
  vi.mocked(runStorageJob).mockResolvedValue(demucs);
  expect(
    await modelSetupApi.install(signal, () => undefined, 'htdemucs_6s'),
  ).toEqual(demucs);
});
