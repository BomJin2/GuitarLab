import { expect, it, vi, afterEach } from 'vitest';
import {
  decodeMix,
  decodeMixStats,
  layerVolume,
  mixApi,
  type MixDocument,
} from './mixing';
import { recordingFixture } from '../../test/recordingFixture';
import { invoke } from '@tauri-apps/api/core';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.resetAllMocks());

it('프로젝트·기준 음원·불변 stem ID와 binary 길이를 검증하고 취소 후 결과를 읽지 않는다', async () => {
  const take = recordingFixture();
  const projectId = take.projectId;
  const assetId = take.transport?.backingAssetId ?? '';
  const stemId = '00000000-0000-4000-8000-000000000099';
  const result = { schemaVersion: 1, projectId, assetId, stemId, bytes: 60 };
  const job = {
    schemaVersion: 1,
    jobId: take.id,
    state: 'COMPLETED',
    completedBytes: 60,
    totalBytes: 60,
    result,
    errorCode: null,
  };
  vi.mocked(invoke)
    .mockResolvedValueOnce(job)
    .mockResolvedValueOnce(new ArrayBuffer(60));
  expect(
    (
      await mixApi.readStem(
        projectId,
        assetId,
        stemId,
        new AbortController().signal,
        vi.fn(),
      )
    ).byteLength,
  ).toBe(60);
  expect(invoke).toHaveBeenCalledWith('read_project_stem', {
    request: { schemaVersion: 1, projectId, assetId, stemId },
  });
  for (const changed of [
    { assetId: take.id },
    { stemId: take.id },
    { projectId: take.id },
    { bytes: 44 },
    { extra: true },
  ]) {
    vi.mocked(invoke).mockResolvedValueOnce({
      ...job,
      result: { ...result, ...changed },
    });
    await expect(
      mixApi.readStem(
        projectId,
        assetId,
        stemId,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow('MIX_CONTRACT_INVALID');
  }
  vi.mocked(invoke)
    .mockResolvedValueOnce(job)
    .mockResolvedValueOnce(new ArrayBuffer(59));
  await expect(
    mixApi.readStem(
      projectId,
      assetId,
      stemId,
      new AbortController().signal,
      vi.fn(),
    ),
  ).rejects.toThrow('MIX_CONTRACT_INVALID');
  const controller = new AbortController();
  controller.abort();
  const calls = vi.mocked(invoke).mock.calls.length;
  await expect(
    mixApi.readStem(projectId, assetId, stemId, controller.signal, vi.fn()),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(vi.mocked(invoke).mock.calls.length).toBe(calls);
});
export function mixFixture(): MixDocument {
  const take = recordingFixture();
  return {
    schemaVersion: 1,
    projectId: take.projectId,
    masterGain: 0.5,
    layers: [
      {
        kind: 'LOCAL_ASSET',
        id: take.transport?.backingAssetId ?? '',
        gain: 0.8,
        mute: false,
        solo: false,
        offsetMs: 0,
      },
      {
        kind: 'TAKE',
        id: take.id,
        gain: 0.6,
        mute: false,
        solo: false,
        offsetMs: 12,
      },
    ],
  };
}
it('믹스 경계에서 버전·유한 음량·중복·YouTube·오프셋을 거부한다', () => {
  const mix = mixFixture();
  expect(decodeMix(mix)).toEqual(mix);
  const imported = {
    ...mix,
    layers: mix.layers.map((layer) => ({ ...layer, kind: 'IMPORTED_STEM' })),
  };
  expect(decodeMix(imported)).toEqual(imported);
  for (const change of [
    { schemaVersion: 2 },
    { masterGain: NaN },
    { layers: [mix.layers[0], mix.layers[0]] },
    { layers: [{ ...mix.layers[0], kind: 'YOUTUBE_EMBED' }] },
    { layers: [{ ...mix.layers[0], offsetMs: 60001 }] },
  ])
    expect(() => decodeMix({ ...mix, ...change })).toThrow();
  expect(layerVolume(mix, mix.layers[0]!)).toBeCloseTo(0.4);
  mix.layers[1]!.solo = true;
  expect(layerVolume(mix, mix.layers[0]!)).toBe(0);
  expect(layerVolume(mix, mix.layers[1]!)).toBeCloseTo(0.3);
  mix.layers[1]!.mute = true;
  expect(layerVolume(mix, mix.layers[1]!)).toBe(0);
});
it('출력 통계 길이를 검증하고 다른 프로젝트의 저장 응답을 채택하지 않는다', async () => {
  const stats = {
    schemaVersion: 1,
    frames: 48000,
    sampleRate: 48000,
    channels: 1,
    peak: 1.5,
    limitedFrames: 4,
    bytes: 192058,
  };
  expect(decodeMixStats(stats)).toEqual(stats);
  expect(() => decodeMixStats({ ...stats, bytes: 10 })).toThrow();
  const mix = mixFixture();
  vi.mocked(invoke).mockResolvedValue({
    schemaVersion: 1,
    mix: { ...mix, projectId: recordingFixture().id },
  });
  await expect(mixApi.load(mix.projectId)).rejects.toThrow(
    'MIX_CONTRACT_INVALID',
  );
});

it('불변 STEM ID를 설정 왕복에 보존하며 중복과 알 수 없는 종류는 거부한다', async () => {
  const mix = mixFixture();
  mix.layers = mix.layers.map((l) => ({ ...l, kind: 'STEM' }));
  expect(decodeMix(mix)).toEqual(mix);
  vi.mocked(invoke).mockResolvedValue({ schemaVersion: 1, mix });
  expect(await mixApi.save(mix)).toEqual(mix);
  expect(await mixApi.load(mix.projectId)).toEqual(mix);
  expect(() =>
    decodeMix({ ...mix, layers: [mix.layers[0], mix.layers[0]] }),
  ).toThrow();
  expect(() =>
    decodeMix({ ...mix, layers: [{ ...mix.layers[0], kind: 'LEAD_GUITAR' }] }),
  ).toThrow();
});
