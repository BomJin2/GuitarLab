import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { projectApi } from './projects';
import { projectFixture, projectFixtureId } from '../../test/projectFixture';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
beforeEach(() => vi.clearAllMocks());
const job = {
  schemaVersion: 1,
  jobId: projectFixtureId,
  state: 'COMPLETED',
  completedBytes: 0,
  totalBytes: 0,
  errorCode: null,
  result: null,
};
const controller = () => new AbortController();
const file = () => new File(['<score-partwise/>'], '내 악보.musicxml');
function asset() {
  return {
    ...projectFixture().assets[0],
    kind: 'SCORE_IMPORT',
    storage: 'MANAGED',
    available: true,
  };
}

it('경로 없이 UTF-8 이름과 동일 악보 바이트를 제한된 raw body로 전달한다', async () => {
  const imported = asset();
  vi.mocked(invoke).mockResolvedValue({
    ...job,
    result: { schemaVersion: 1, asset: imported, duplicate: false },
  });
  await expect(
    projectApi.importDroppedScore(
      projectFixtureId,
      file(),
      controller().signal,
      () => {},
    ),
  ).resolves.toEqual({ asset: imported, duplicate: false });
  const [command, body] = vi.mocked(invoke).mock.calls[0] ?? [];
  expect(command).toBe('import_project_score_bytes');
  if (!(body instanceof Uint8Array)) throw new Error('raw body 필요');
  const length = new DataView(
    body.buffer,
    body.byteOffset,
    body.byteLength,
  ).getUint32(0, true);
  expect(
    JSON.parse(new TextDecoder().decode(body.slice(4, 4 + length))),
  ).toEqual({
    schemaVersion: 1,
    projectId: projectFixtureId,
    name: '내 악보.musicxml',
  });
  expect(new TextDecoder().decode(body.slice(4 + length))).toBe(
    '<score-partwise/>',
  );
});

it('빈 파일·과도한 크기·미지원 종류·잘못된 ID와 읽기 전 취소는 native 명령을 시작하지 않는다', async () => {
  const big = new File(['x'], 'big.xml');
  Object.defineProperty(big, 'size', { value: 8 * 1024 * 1024 + 1 });
  for (const invalid of [
    new File([], 'empty.xml'),
    new File(['x'], 'audio.wav'),
    big,
  ]) {
    await expect(
      projectApi.importDroppedScore(
        projectFixtureId,
        invalid,
        controller().signal,
        () => {},
      ),
    ).rejects.toBeTruthy();
  }
  await expect(
    projectApi.importDroppedScore(
      '../escape',
      file(),
      controller().signal,
      () => {},
    ),
  ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
  const canceled = controller();
  canceled.abort();
  await expect(
    projectApi.importDroppedScore(
      projectFixtureId,
      file(),
      canceled.signal,
      () => {},
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(invoke).not.toHaveBeenCalled();
});

it('다른 프로젝트/외부 참조·음원·누락 자산과 잘못된 응답은 적용하지 않는다', async () => {
  const original = asset();
  for (const invalid of [
    null,
    { ...original, projectId: '00000000-0000-4000-8000-000000000099' },
    { ...original, storage: 'REFERENCE' },
    { ...original, kind: 'ORIGINAL' },
    { ...original, available: false },
  ]) {
    vi.mocked(invoke).mockResolvedValue({
      ...job,
      result: { schemaVersion: 1, asset: invalid, duplicate: false },
    });
    await expect(
      projectApi.importDroppedScore(
        projectFixtureId,
        file(),
        controller().signal,
        () => {},
      ),
    ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
  }
});

it('취소 요청 뒤에도 실제 native 취소 종료까지 기다린다', async () => {
  let polls = 0;
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === 'get_storage_job'
      ? { ...job, state: ++polls === 1 ? 'CANCELING' : 'CANCELED' }
      : { ...job, state: 'RUNNING' },
  );
  const canceled = controller();
  await expect(
    projectApi.importDroppedScore(
      projectFixtureId,
      file(),
      canceled.signal,
      () => canceled.abort(),
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(polls).toBe(2);
  expect(invoke).toHaveBeenCalledWith('cancel_storage_job', {
    request: { schemaVersion: 1, jobId: projectFixtureId },
  });
});
