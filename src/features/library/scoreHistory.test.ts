import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { projectFixture, projectFixtureId } from '../../test/projectFixture';
import { decodeRevisionPage, scoreHistoryApi } from './scoreHistory';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.resetAllMocks());
const entry = { revisionId: projectFixtureId, revision: 1, createdAtMs: 1 };
const page = {
  projectId: projectFixtureId,
  headRevision: 1,
  entries: [entry],
  nextBeforeRevision: null,
};
const wrap = (page: unknown) => ({ schemaVersion: 1, page });
function complete(result: unknown) {
  return {
    schemaVersion: 1,
    jobId: projectFixtureId,
    state: 'COMPLETED',
    completedBytes: 0,
    totalBytes: 0,
    errorCode: null,
    result,
  };
}
it('목록·조회는 프로젝트/버전 ID와 계약 버전만 보내고 저장 내용을 검증한다', async () => {
  const signal = new AbortController().signal;
  vi.mocked(invoke).mockResolvedValue(complete(wrap(page)));
  await expect(
    scoreHistoryApi.list(projectFixtureId, null, signal, vi.fn()),
  ).resolves.toEqual(page);
  expect(invoke).toHaveBeenLastCalledWith('list_score_revisions', {
    request: {
      schemaVersion: 1,
      projectId: projectFixtureId,
      beforeRevision: null,
    },
  });
  const revision = projectFixture().revision;
  vi.mocked(invoke).mockResolvedValue(complete({ schemaVersion: 1, revision }));
  await expect(
    scoreHistoryApi.read(projectFixtureId, entry, signal, vi.fn()),
  ).resolves.toMatchObject({ revisionId: entry.revisionId, revision: 1 });
  expect(invoke).toHaveBeenLastCalledWith('read_score_revision', {
    request: {
      schemaVersion: 1,
      projectId: projectFixtureId,
      revisionId: entry.revisionId,
    },
  });
  expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
    'list_score_revisions',
    'read_score_revision',
  ]);
});
it('내림차순 100개와 이어 읽기 경계·빈 목록만 허용한다', () => {
  const entries = Array.from({ length: 100 }, (_, index) => ({
    ...entry,
    revision: 101 - index,
    revisionId: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
  }));
  expect(
    decodeRevisionPage(
      wrap({ ...page, headRevision: 101, entries, nextBeforeRevision: 2 }),
      projectFixtureId,
      null,
    ).entries,
  ).toHaveLength(100);
  expect(decodeRevisionPage(wrap(page), projectFixtureId, 2)).toEqual(page);
  expect(
    decodeRevisionPage(
      wrap({ ...page, headRevision: 0, entries: [] }),
      projectFixtureId,
      null,
    ).entries,
  ).toEqual([]);
  for (const invalid of [
    { ...page, projectId: '00000000-0000-4000-8000-000000000099' },
    { ...page, headRevision: 2 },
    { ...page, entries: [] },
    { ...page, entries: [entry, entry] },
    { ...page, entries: [{ ...entry, createdAtMs: -1 }] },
    { ...page, entries: [{ ...entry, revisionId: '../private' }] },
    { ...page, entries: [{ ...entry, extra: 1 }] },
    { ...page, nextBeforeRevision: 1 },
    { ...page, extra: 1 },
    { ...page, headRevision: 101, entries: [...entries, entry] },
    {
      ...page,
      headRevision: 101,
      entries: [...entries].reverse(),
      nextBeforeRevision: 2,
    },
  ])
    expect(() =>
      decodeRevisionPage(wrap(invalid), projectFixtureId, null),
    ).toThrow('PROJECT_CONTRACT_INVALID');
  expect(() => decodeRevisionPage(wrap(page), projectFixtureId, 1)).toThrow();
});
it('잘못된 요청·사전 취소·타 프로젝트/버전·손상 저장 응답은 거부한다', async () => {
  const signal = new AbortController().signal;
  await expect(
    scoreHistoryApi.list('../private', null, signal, vi.fn()),
  ).rejects.toThrow();
  await expect(
    scoreHistoryApi.list(projectFixtureId, 0, signal, vi.fn()),
  ).rejects.toThrow();
  const canceled = new AbortController();
  canceled.abort();
  await expect(
    scoreHistoryApi.list(projectFixtureId, null, canceled.signal, vi.fn()),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  for (const changes of [
    { projectId: '00000000-0000-4000-8000-000000000099' },
    { revision: 2 },
    { revisionId: '00000000-0000-4000-8000-000000000099' },
    { score: null },
  ]) {
    vi.mocked(invoke).mockResolvedValue(
      complete({
        schemaVersion: 1,
        revision: { ...projectFixture().revision, ...changes },
      }),
    );
    await expect(
      scoreHistoryApi.read(projectFixtureId, entry, signal, vi.fn()),
    ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
  }
});
