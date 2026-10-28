import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { projectApi, type JobSnapshot } from './projects';
import { projectFixture, projectFixtureId } from '../../test/projectFixture';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
beforeEach(() => vi.clearAllMocks());
const base: JobSnapshot = {
  schemaVersion: 1,
  jobId: projectFixtureId,
  state: 'RUNNING',
  completedBytes: 0,
  totalBytes: 0,
  errorCode: null,
  result: null,
};
const controller = () => new AbortController();
function final(file: File) {
  return {
    ...base,
    state: 'COMPLETED',
    result: {
      schemaVersion: 1,
      duplicate: false,
      asset: {
        ...projectFixture().assets[0],
        kind: 'ORIGINAL',
        storage: 'MANAGED',
        available: true,
        bytes: file.size,
      },
    },
  };
}
function ack(body: unknown) {
  if (!(body instanceof Uint8Array)) throw new Error('조각 raw body 필요');
  const offset = new DataView(
    body.buffer,
    body.byteOffset,
    body.byteLength,
  ).getUint32(36, true);
  return {
    schemaVersion: 1,
    jobId: projectFixtureId,
    receivedBytes: offset + body.length - 44,
  };
}

it('큰 음원을 1MiB 조각으로 한 번씩 전달하고 최종 native commit 뒤에만 자산을 반환한다', async () => {
  const bytes = new Uint8Array(2 * 1024 * 1024 + 13);
  bytes[0] = 7;
  bytes[1024 * 1024] = 8;
  bytes[bytes.length - 1] = 9;
  const file = new File([bytes], '반주.wav');
  const chunks: Uint8Array[] = [];
  let polls = 0;
  vi.mocked(invoke).mockImplementation(async (command, body) => {
    if (command === 'append_project_audio_upload') {
      if (!(body instanceof Uint8Array)) throw new Error('조각 형식');
      chunks.push(body);
      return ack(body);
    }
    if (command === 'get_storage_job')
      return ++polls === 1
        ? {
            ...base,
            completedBytes: Math.floor(file.size / 2),
            totalBytes: file.size,
          }
        : final(file);
    return base;
  });
  const progress = vi.fn();
  await expect(
    projectApi.importDroppedAudio(
      projectFixtureId,
      file,
      controller().signal,
      progress,
    ),
  ).resolves.toMatchObject({ asset: { kind: 'ORIGINAL', bytes: file.size } });
  expect(chunks.map((chunk) => chunk.length - 44)).toEqual([
    1024 * 1024,
    1024 * 1024,
    13,
  ]);
  expect(
    chunks.map((chunk) => new TextDecoder().decode(chunk.slice(0, 36))),
  ).toEqual([projectFixtureId, projectFixtureId, projectFixtureId]);
  expect(
    chunks.map((chunk) => new DataView(chunk.buffer).getUint32(36, true)),
  ).toEqual([0, 1024 * 1024, 2 * 1024 * 1024]);
  expect(chunks[0]?.[44]).toBe(7);
  expect(chunks[1]?.[44]).toBe(8);
  expect(chunks[2]?.at(-1)).toBe(9);
  expect(polls).toBe(2);
  expect(invoke).toHaveBeenCalledWith('begin_project_audio_upload', {
    request: {
      schemaVersion: 1,
      projectId: projectFixtureId,
      name: '반주.wav',
      bytes: file.size,
    },
  });
});

it.each(['foreign', 'offset', 'version'])(
  '잘못된 조각 확인 %s는 취소 정리가 끝나기 전 반환하지 않는다',
  async (mode) => {
    const file = new File(['abc'], 'audio.mp3');
    let polls = 0;
    vi.mocked(invoke).mockImplementation(async (command, body) => {
      if (command === 'append_project_audio_upload')
        return {
          ...ack(body),
          ...(mode === 'foreign'
            ? { jobId: '00000000-0000-4000-8000-000000000099' }
            : mode === 'offset'
              ? { receivedBytes: 2 }
              : { schemaVersion: 2 }),
        };
      if (command === 'get_storage_job')
        return { ...base, state: ++polls === 1 ? 'CANCELING' : 'CANCELED' };
      return base;
    });
    await expect(
      projectApi.importDroppedAudio(
        projectFixtureId,
        file,
        controller().signal,
        () => {},
      ),
    ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
    expect(polls).toBe(2);
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === 'cancel_storage_job'),
    ).toHaveLength(1);
  },
);

it('조각 사이 취소는 다음 FileReader/조각 전송을 멈추고 실제 종료까지 기다린다', async () => {
  const file = new File([new Uint8Array(1024 * 1024 + 7)], 'audio.wav');
  const cancel = controller();
  let polls = 0;
  vi.mocked(invoke).mockImplementation(async (command, body) => {
    if (command === 'append_project_audio_upload') {
      cancel.abort();
      return ack(body);
    }
    if (command === 'get_storage_job')
      return { ...base, state: ++polls === 1 ? 'CANCELING' : 'CANCELED' };
    return base;
  });
  await expect(
    projectApi.importDroppedAudio(
      projectFixtureId,
      file,
      cancel.signal,
      () => {},
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(
        ([command]) => command === 'append_project_audio_upload',
      ),
  ).toHaveLength(1);
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === 'cancel_storage_job'),
  ).toHaveLength(1);
  expect(polls).toBe(2);
});

it('미지원·빈 파일·256MiB 초과·취소된 요청은 native 전송을 시작하지 않는다', async () => {
  const large = new File(['x'], 'large.wav');
  Object.defineProperty(large, 'size', { value: 256 * 1024 * 1024 + 1 });
  for (const file of [
    new File([], 'empty.wav'),
    new File(['x'], 'score.xml'),
    large,
  ])
    await expect(
      projectApi.importDroppedAudio(
        projectFixtureId,
        file,
        controller().signal,
        () => {},
      ),
    ).rejects.toBeTruthy();
  const cancel = controller();
  cancel.abort();
  await expect(
    projectApi.importDroppedAudio(
      projectFixtureId,
      new File(['x'], 'a.wav'),
      cancel.signal,
      () => {},
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(invoke).not.toHaveBeenCalled();
});

it('마지막 DB 실패는 수신이 끝났어도 성공으로 표시하지 않고 실제 오류를 유지한다', async () => {
  const file = new File(['abc'], 'a.mp3');
  vi.mocked(invoke).mockImplementation(async (command, body) =>
    command === 'append_project_audio_upload'
      ? ack(body)
      : command === 'get_storage_job'
        ? { ...base, state: 'ERROR', errorCode: 'STORAGE_ERROR' }
        : base,
  );
  await expect(
    projectApi.importDroppedAudio(
      projectFixtureId,
      file,
      controller().signal,
      () => {},
    ),
  ).rejects.toThrow('STORAGE_ERROR');
});

it('취소 뒤 실제 정리 오류는 취소 안내에 가리지 않는다', async () => {
  const file = new File(['abc'], 'a.mp3');
  const cancel = controller();
  vi.mocked(invoke).mockImplementation(async (command, body) => {
    if (command === 'append_project_audio_upload') {
      cancel.abort();
      return ack(body);
    }
    return command === 'get_storage_job'
      ? { ...base, state: 'ERROR', errorCode: 'STORAGE_ERROR' }
      : base;
  });
  await expect(
    projectApi.importDroppedAudio(
      projectFixtureId,
      file,
      cancel.signal,
      () => {},
    ),
  ).rejects.toThrow('STORAGE_ERROR');
});

it('최종 자산의 프로젝트·종류·보관 방식·크기·가용성 불일치는 적용하지 않는다', async () => {
  const file = new File(['abc'], 'a.mp3');
  const completed = final(file);
  for (const changed of [
    { projectId: '00000000-0000-4000-8000-000000000099' },
    { kind: 'SCORE_IMPORT' },
    { storage: 'REFERENCE' },
    { bytes: 4 },
    { available: false },
  ]) {
    vi.mocked(invoke).mockImplementation(async (command, body) =>
      command === 'append_project_audio_upload'
        ? ack(body)
        : command === 'get_storage_job'
          ? {
              ...completed,
              result: {
                ...completed.result,
                asset: { ...completed.result.asset, ...changed },
              },
            }
          : base,
    );
    await expect(
      projectApi.importDroppedAudio(
        projectFixtureId,
        file,
        controller().signal,
        () => {},
      ),
    ).rejects.toThrow('PROJECT_CONTRACT_INVALID');
  }
});
