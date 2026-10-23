import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  decodeDetails,
  decodeJob,
  decodeRevision,
  projectApi,
  runStorageJob,
} from './projects';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import { projectFixture, projectFixtureId } from '../../test/projectFixture';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
beforeEach(() => vi.clearAllMocks());
it('빈 악보 생성은 버전·프로젝트를 전달하고 다른 프로젝트/형식/저장 방식·누락 응답을 거부한다', async () => {
  const fixture = projectFixture();
  const asset = { ...fixture.assets[0], storage: 'MANAGED', available: true };
  const completed = (value: unknown) => ({
    schemaVersion: 1,
    jobId: projectFixtureId,
    state: 'COMPLETED',
    completedBytes: 0,
    totalBytes: 0,
    errorCode: null,
    result: { schemaVersion: 1, asset: value },
  });
  vi.mocked(invoke).mockResolvedValue(completed(asset));
  await expect(
    projectApi.createBlankScore(
      projectFixtureId,
      1,
      new AbortController().signal,
      () => undefined,
    ),
  ).resolves.toMatchObject(asset);
  expect(invoke).toHaveBeenCalledWith('create_blank_project_score', {
    request: {
      schemaVersion: 1,
      projectId: projectFixtureId,
      expectedRevision: 1,
    },
  });
  for (const invalid of [
    { ...asset, projectId: '00000000-0000-4000-8000-000000000099' },
    { ...asset, kind: 'ORIGINAL' },
    { ...asset, storage: 'REFERENCE' },
    { ...asset, available: false },
    null,
  ]) {
    vi.mocked(invoke).mockResolvedValueOnce(completed(invalid));
    await expect(
      projectApi.createBlankScore(
        projectFixtureId,
        1,
        new AbortController().signal,
        () => undefined,
      ),
    ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
  }
  vi.mocked(invoke).mockClear();
  await expect(
    projectApi.createBlankScore(
      '../escape',
      0,
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toThrow();
  await expect(
    projectApi.createBlankScore(
      projectFixtureId,
      -1,
      new AbortController().signal,
      () => undefined,
    ),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
it.each(['CANCELED', 'ERROR'])(
  '설치 취소는 native 정리의 %s까지 기다리고 정리 실패를 숨기지 않는다',
  async (terminal) => {
    const base = {
      schemaVersion: 1,
      jobId: projectFixtureId,
      state: 'RUNNING',
      completedBytes: 1,
      totalBytes: 5,
      result: null,
      errorCode: null,
    };
    let polls = 0;
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'get_storage_job')
        return {
          ...base,
          state: ++polls === 1 ? 'CANCELING' : terminal,
          errorCode:
            terminal === 'ERROR' ? 'AI_SETUP_CLEANUP_FAILED' : 'CANCELED',
        };
      return base;
    });
    const controller = new AbortController();
    const work = runStorageJob(
      'install_ai_model',
      { modelId: 'basic-pitch' },
      controller.signal,
      () => controller.abort(),
      { waitForCancellation: true },
    );
    if (terminal === 'ERROR')
      await expect(work).rejects.toThrow('AI_SETUP_CLEANUP_FAILED');
    else await expect(work).rejects.toMatchObject({ name: 'AbortError' });
    expect(polls).toBe(2);
    expect(invoke).toHaveBeenCalledWith('cancel_storage_job', {
      request: { schemaVersion: 1, jobId: projectFixtureId },
    });
  },
);
it('구형 index 저장은 ID를 복원하고 불일치·없는 선택 ID는 거부한다', () => {
  const revision = projectFixture().revision;
  if (!revision) throw new Error('저장 fixture 없음');
  const first = revision.score.tracks[0];
  if (!first) throw new Error('트랙 없음');
  expect(decodeRevision(revision).workspace.activePerformanceTrackId).toBe(
    first.id,
  );
  expect(
    decodeRevision({
      ...revision,
      workspace: { ...revision.workspace, activePerformanceTrackId: first.id },
    }).workspace.activePerformanceTrackId,
  ).toBe(first.id);
  for (const id of ['missing-track', null, 123]) {
    expect(() =>
      decodeRevision({
        ...revision,
        workspace: { ...revision.workspace, activePerformanceTrackId: id },
      }),
    ).toThrow();
  }
});
it('저장 악보의 관계·중복·수치 오류와 다른 프로젝트 asset을 거부한다', () => {
  const fixture = projectFixture();
  expect(decodeDetails(fixture).revision?.workspace.rate).toBe(0.75);
  if (!fixture.revision) throw new Error('fixture 없음');
  const revision = fixture.revision;
  const score = revision.score;
  const track = score.tracks[0];
  if (!track) throw new Error('트랙 없음');
  expect(() =>
    decodeScoreDocument({
      ...score,
      tracks: [{ ...track, notes: [...track.notes, ...track.notes] }],
    }),
  ).toThrow();
  expect(() =>
    decodeScoreDocument({ ...score, tempoMap: [{ tick: 0, bpm: NaN }] }),
  ).toThrow();
  expect(() =>
    decodeScoreDocument({
      ...score,
      tracks: [
        {
          ...track,
          notes: track.notes.map((n) => ({ ...n, trackId: 'other' })),
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    decodeDetails({
      ...fixture,
      assets: fixture.assets.map((a) => ({
        ...a,
        projectId: '00000000-0000-4000-8000-000000000099',
      })),
    }),
  ).toThrow();
  expect(() =>
    decodeDetails({
      ...fixture,
      revision: {
        ...revision,
        workspace: { ...revision.workspace, activeTrackIndex: 99 },
      },
    }),
  ).toThrow();
  expect(() =>
    decodeJob({
      schemaVersion: 1,
      jobId: projectFixtureId,
      state: ['COMPLETED'],
      completedBytes: 0,
      totalBytes: 0,
      result: null,
      errorCode: null,
    }),
  ).toThrow();
});
it('실제 작업 취소가 이전 job ID로 전달되고 오래된 완료를 기다리지 않는다', async () => {
  vi.mocked(invoke).mockResolvedValue({
    schemaVersion: 1,
    jobId: projectFixtureId,
    state: 'RUNNING',
    completedBytes: 0,
    totalBytes: 0,
    result: null,
    errorCode: null,
  });
  const controller = new AbortController();
  const work = projectApi.open(projectFixtureId, controller.signal, () =>
    controller.abort(),
  );
  await expect(work).rejects.toMatchObject({ name: 'AbortError' });
  expect(invoke).toHaveBeenCalledWith('cancel_storage_job', {
    request: { schemaVersion: 1, jobId: projectFixtureId },
  });
});
it('binary 길이·저장 버전과 프로젝트 식별자가 응답과 맞아야 한다', async () => {
  vi.mocked(invoke)
    .mockResolvedValueOnce({
      schemaVersion: 1,
      jobId: projectFixtureId,
      state: 'COMPLETED',
      completedBytes: 3,
      totalBytes: 3,
      result: { schemaVersion: 1, name: 'test.wav', bytes: 3 },
      errorCode: null,
    })
    .mockResolvedValueOnce(new ArrayBuffer(2));
  await expect(
    projectApi.read(
      projectFixtureId,
      '00000000-0000-4000-8000-000000000002',
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
  const fixture = projectFixture();
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    jobId: projectFixtureId,
    state: 'COMPLETED',
    completedBytes: 0,
    totalBytes: 0,
    result: { schemaVersion: 1, revision: fixture.revision },
    errorCode: null,
  });
  if (!fixture.revision) throw new Error('revision 없음');
  await expect(
    projectApi.save(
      projectFixtureId,
      2,
      fixture.revision.scoreAssetId,
      fixture.revision.score,
      fixture.revision.workspace,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
});
