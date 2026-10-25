import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  normalizeProjectMetadata,
  projectMetadataApi,
} from './projectMetadata';
import { projectFixture, projectFixtureId } from '../../test/projectFixture';
import { projectError } from './projects';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.resetAllMocks());
function complete(project: unknown) {
  return {
    schemaVersion: 1,
    jobId: projectFixtureId,
    state: 'COMPLETED',
    completedBytes: 0,
    totalBytes: 0,
    errorCode: null,
    result: { schemaVersion: 1, project },
  };
}
it('정규화한 정보와 기존 값만 전달하고 저장 버전과 소유권이 같은 요약을 받는다', async () => {
  const current = projectFixture().project;
  const next = {
    ...current,
    title: '새 제목',
    artist: '가수',
    updatedAtMs: current.updatedAtMs + 1,
  };
  vi.mocked(invoke).mockResolvedValue(complete(next));
  await expect(
    projectMetadataApi.update(
      current,
      { title: ' 새 제목 ', artist: ' 가수 ' },
      new AbortController().signal,
      vi.fn(),
    ),
  ).resolves.toEqual(next);
  expect(invoke).toHaveBeenCalledWith('update_project_metadata', {
    request: {
      schemaVersion: 1,
      projectId: current.id,
      expected: { title: current.title, artist: current.artist },
      changes: { title: '새 제목', artist: '가수' },
    },
  });
  expect(normalizeProjectMetadata(' 제목 ', '  ')).toEqual({
    title: '제목',
    artist: null,
  });
  expect(normalizeProjectMetadata('🎸'.repeat(200), '')).toHaveProperty(
    'title',
    '🎸'.repeat(200),
  );
});
it('빈 제목·제어문자/길이·취소·다른 ID/모드/악보 버전/요청과 다른 결과는 거부한다', async () => {
  const current = projectFixture().project;
  for (const [title, artist] of [
    ['', ''],
    ['가'.repeat(201), ''],
    ['제목\n', ''],
    ['제목', '가'.repeat(201)],
    ['제목', '\t'],
    ['제목', '잘못\u0085'],
  ] as const) {
    await expect(
      projectMetadataApi.update(
        current,
        { title, artist },
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow('PROJECT_METADATA_INVALID');
  }
  const canceled = new AbortController();
  canceled.abort();
  await expect(
    projectMetadataApi.update(
      current,
      { title: '수정', artist: null },
      canceled.signal,
      vi.fn(),
    ),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  const next = { ...current, title: '수정', artist: null };
  for (const invalid of [
    { ...next, id: '00000000-0000-4000-8000-000000000099' },
    { ...next, mode: current.mode === 'copy' ? 'practice' : 'copy' },
    { ...next, revision: current.revision + 1 },
    { ...next, title: '다른 제목' },
    { ...next, artist: '다른 값' },
    { ...next, updatedAtMs: -1 },
    null,
  ]) {
    vi.mocked(invoke).mockResolvedValue(complete(invalid));
    await expect(
      projectMetadataApi.update(
        current,
        { title: '수정', artist: null },
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
  }
  expect(projectError(new Error('PROJECT_METADATA_CONFLICT'))).toContain(
    '정보가 바뀌었습니다',
  );
  expect(projectError(new Error('PROJECT_METADATA_INVALID'))).toContain(
    '200자',
  );
});
