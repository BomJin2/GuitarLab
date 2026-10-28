import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import type { ScoreSession } from '../score/scoreSession';
import { PlayerEngine } from '../player/PlayerEngine';
import { Context } from '../player/playerContextValue';
import { projectApi, type ProjectSummary } from './projects';
import { useProjects } from './useProjects';
import { projectMetadataApi } from './projectMetadata';
import { useScoreAutosave } from './useScoreAutosave';
import { projectTrashApi, type TrashedProject } from './projectTrash';
import { projectFixture } from '../../test/projectFixture';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { editNote } from '../score/scoreEditing';
import { editStructure } from '../score/scoreStructure';
import { renderNormalized } from '../score/normalizedNotation';
import { selectScoreTrack } from '../score/trackSelection';
import blankXml from '../../../fixtures/blank.musicxml?raw';
import jsonScore from '../../../fixtures/manual-score-v1.json?raw';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
} from '../score/alphaTabAdapter';
vi.mock('./projects', async (original) => ({
  ...(await original<typeof import('./projects')>()),
  projectApi: {
    available: () => true,
    list: vi.fn(),
    create: vi.fn(),
    open: vi.fn(),
    read: vi.fn(),
    import: vi.fn(),
    importDroppedScore: vi.fn(),
    importDroppedAudio: vi.fn(),
    save: vi.fn(),
    relink: vi.fn(),
    createBlankScore: vi.fn(),
  },
}));
vi.mock('./projectMetadata', async (original) => ({
  ...(await original<typeof import('./projectMetadata')>()),
  projectMetadataApi: { update: vi.fn() },
}));
vi.mock('./projectTrash', async (original) => ({
  ...(await original<typeof import('./projectTrash')>()),
  projectTrashApi: {
    list: vi.fn(),
    trash: vi.fn(),
    restore: vi.fn(),
    usage: vi.fn(),
  },
}));
beforeEach(() => {
  localStorage.removeItem('guitarlab.score-autosave.v1');
  vi.clearAllMocks();
  vi.mocked(projectApi.list).mockResolvedValue([]);
  vi.mocked(projectTrashApi.list).mockResolvedValue([]);
});
function deferred<T>() {
  let resolve: (v: T) => void = () => {
    throw new Error('대기 초기화');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('정보 수정은 미저장 세션/재생·경로를 유지하고 목록과 현재 제목만 바꾼다', async () => {
  const details = projectFixture();
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  const source = scoreEditingFixture();
  act(() => result.current.setSession(source));
  const before = engine.getSnapshot();
  const updated = {
    ...details.project,
    title: '새 제목',
    artist: '연주자',
    updatedAtMs: details.project.updatedAtMs + 1,
  };
  vi.mocked(projectMetadataApi.update).mockResolvedValue(updated);
  vi.mocked(projectApi.list).mockResolvedValue([updated]);
  await act(async () =>
    result.current.project.updateMetadata(' 새 제목 ', ' 연주자 '),
  );
  expect(result.current.session).toBe(source);
  expect(engine.getSnapshot()).toBe(before);
  expect(result.current.project.details?.project).toEqual(updated);
  expect(result.current.project.details?.revision).toBeNull();
  expect(result.current.project.projects[0]).toEqual(updated);
  expect(result.current.project.notice).toContain(
    '프로젝트 정보를 저장했습니다',
  );
  expect(result.current.project.scoreSaved).toBe(false);
  engine.dispose();
});
it('정보 수정 취소는 실제 종료까지 중복 변경을 막고 실패 뒤 입력·세션을 유지한다', async () => {
  const details = projectFixture();
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  const source = scoreEditingFixture();
  act(() => result.current.setSession(source));
  const pending = deferred<void>();
  let signal: AbortSignal | undefined;
  vi.mocked(projectMetadataApi.update).mockImplementation(
    async (_current, _changes, current) => {
      signal = current;
      await pending.promise;
      throw new DOMException('취소', 'AbortError');
    },
  );
  let updating: Promise<void> | undefined;
  act(() => {
    updating = result.current.project.updateMetadata('수정', '');
  });
  act(() => result.current.project.cancel());
  expect(signal?.aborted).toBe(true);
  expect(result.current.project.busy).toBe(true);
  await act(async () => result.current.project.updateMetadata('중복', ''));
  expect(projectMetadataApi.update).toHaveBeenCalledOnce();
  await act(async () => {
    pending.resolve();
    await updating;
  });
  expect(result.current.project.busy).toBe(false);
  expect(result.current.project.details?.project).toEqual(details.project);
  expect(result.current.session).toBe(source);
  vi.mocked(projectMetadataApi.update).mockRejectedValue(
    new Error('PROJECT_METADATA_CONFLICT'),
  );
  await act(async () => result.current.project.updateMetadata('수정', ''));
  expect(result.current.project.error).toContain('정보가 바뀌었습니다');
  expect(result.current.session).toBe(source);
  engine.dispose();
});
it('정보 수정의 취소가 커밋 뒤 도착하면 완료된 요약을 반영하고 저장 취소로 가장하지 않는다', async () => {
  const details = projectFixture();
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  const updated = {
    ...details.project,
    title: '완료된 수정',
    updatedAtMs: details.project.updatedAtMs + 1,
  };
  const pending = deferred<typeof updated>();
  vi.mocked(projectMetadataApi.update).mockReturnValue(pending.promise);
  vi.mocked(projectApi.list).mockResolvedValue([updated]);
  let updating: Promise<void> | undefined;
  act(() => {
    updating = result.current.project.updateMetadata(
      '완료된 수정',
      details.project.artist ?? '',
    );
  });
  act(() => result.current.project.cancel());
  expect(result.current.project.busy).toBe(true);
  await act(async () => {
    pending.resolve(updated);
    await updating;
  });
  expect(result.current.project.details?.project).toEqual(updated);
  expect(result.current.project.notice).toContain(
    '프로젝트 정보를 저장했습니다',
  );
  expect(result.current.project.busy).toBe(false);
  engine.dispose();
});
it('용량 확인 취소는 실제 종료까지 복원을 막고 미저장 편집을 유지한다', async () => {
  const entry = {
    project: projectFixture().project,
    trashId: '00000000-0000-4000-8000-0000000000f2',
    trashedAtMs: 42,
  };
  const pending = deferred<void>();
  let signal: AbortSignal | undefined;
  vi.mocked(projectTrashApi.usage).mockImplementation(
    async (_entry, current) => {
      signal = current;
      await pending.promise;
      throw new DOMException('취소', 'AbortError');
    },
  );
  const { result, engine } = harness();
  const source = scoreEditingFixture();
  act(() => result.current.setSession(source));
  let checking: Promise<void> | undefined;
  act(() => {
    checking = result.current.project.inspectTrashUsage(entry);
  });
  act(() => result.current.project.cancel());
  expect(signal?.aborted).toBe(true);
  expect(result.current.project.busy).toBe(true);
  await act(async () => result.current.project.restoreProject(entry));
  expect(projectTrashApi.restore).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve();
    await checking;
  });
  expect(result.current.project.busy).toBe(false);
  expect(result.current.project.trashUsage).toBeNull();
  expect(result.current.session).toBe(source);
  expect(result.current.project.notice).toMatch(/취소/);
  engine.dispose();
});
it('화면 해제는 용량 확인에 취소를 전달하고 늦은 성공을 게시하지 않는다', async () => {
  const entry = {
    project: projectFixture().project,
    trashId: '00000000-0000-4000-8000-0000000000f2',
    trashedAtMs: 42,
  };
  const usage = {
    projectId: entry.project.id,
    trashId: entry.trashId,
    files: 0,
    logicalBytes: 0,
    externalReferences: 0,
  };
  const pending = deferred<typeof usage>();
  let signal: AbortSignal | undefined;
  vi.mocked(projectTrashApi.usage).mockImplementation((_entry, current) => {
    signal = current;
    return pending.promise;
  });
  const { result, engine, unmount } = harness();
  let checking: Promise<void> | undefined;
  act(() => {
    checking = result.current.project.inspectTrashUsage(entry);
  });
  const before = result.current.project;
  unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    pending.resolve(usage);
    await checking;
  });
  expect(result.current.project).toBe(before);
  expect(result.current.project.trashUsage).toBeNull();
  engine.dispose();
});
function harness(beforeReplace: () => boolean | Promise<boolean> = () => true) {
  const engine = new PlayerEngine();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Context.Provider value={engine}>{children}</Context.Provider>
  );
  const hook = renderHook(
    () => {
      const [session, setSession] = useState<ScoreSession | null>(null);
      const project = useProjects(session, setSession, beforeReplace);
      return {
        project,
        autosave: useScoreAutosave(project, session, false),
        session,
        setSession,
      };
    },
    { wrapper },
  );
  return { ...hook, engine };
}

it('프로젝트 악보 drop은 관리용 원본을 연결하고 저장 head는 명시적 저장 전 유지한다', async () => {
  const details = projectFixture();
  const asset = {
    ...details.assets[0]!,
    kind: 'SCORE_IMPORT' as const,
    storage: 'MANAGED' as const,
    available: true,
  };
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  vi.mocked(projectApi.importDroppedScore).mockResolvedValue({
    asset,
    duplicate: false,
  });
  vi.mocked(projectApi.read).mockResolvedValue({
    name: 'custom.json',
    data: new TextEncoder().encode(jsonScore).buffer,
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  const file = new File([jsonScore], 'custom.json');
  await act(async () =>
    result.current.project.importAsset('SCORE_IMPORT', 'MANAGED', file),
  );
  expect(projectApi.importDroppedScore).toHaveBeenCalledWith(
    details.project.id,
    file,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(projectApi.import).not.toHaveBeenCalled();
  expect(result.current.session?.originalAssetId).toBe(asset.id);
  expect(result.current.session?.document.tracks[0]?.notes[0]?.fret).toBe(3);
  expect(result.current.project.details?.revision).toBeNull();
  expect(result.current.project.scoreSaved).toBe(false);
  engine.dispose();
});

it('음원 drop은 기존 악보·편집을 유지하면서 관리용 음원만 플레이어에 연결한다', async () => {
  const details = projectFixture();
  const asset = {
    ...details.assets[0]!,
    kind: 'ORIGINAL' as const,
    storage: 'MANAGED' as const,
    available: true,
  };
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  vi.mocked(projectApi.importDroppedAudio).mockResolvedValue({
    asset,
    duplicate: false,
  });
  vi.mocked(projectApi.read).mockResolvedValue({
    name: 'audio.wav',
    data: new Uint8Array([1, 2, 3]).buffer,
  });
  const confirm = vi.fn().mockReturnValue(true);
  const { result, engine } = harness(confirm);
  const load = vi.spyOn(engine, 'load').mockImplementation(() => {});
  await act(async () => result.current.project.open(details.project.id));
  const previous = scoreEditingFixture();
  act(() => result.current.setSession(previous));
  confirm.mockClear();
  const file = new File(['RIFF'], 'audio.wav');
  await act(async () =>
    result.current.project.importAsset('ORIGINAL', 'MANAGED', file),
  );
  expect(projectApi.importDroppedAudio).toHaveBeenCalledWith(
    details.project.id,
    file,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(projectApi.import).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
  expect(result.current.session).toBe(previous);
  expect(result.current.project.audioAssetId).toBe(asset.id);
  expect(load).toHaveBeenCalledWith(expect.any(File));
  expect(result.current.project.details?.revision).toBeNull();
  engine.dispose();
});

it('음원 drop의 늦은 완료는 취소 뒤 기존 재생·음원 선택에 적용하지 않는다', async () => {
  const details = projectFixture();
  const asset = {
    ...details.assets[0]!,
    kind: 'ORIGINAL' as const,
    storage: 'MANAGED' as const,
    available: true,
  };
  const pending = deferred<{ asset: typeof asset; duplicate: boolean }>();
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  vi.mocked(projectApi.importDroppedAudio).mockReturnValue(pending.promise);
  vi.mocked(projectApi.read).mockResolvedValue({
    name: 'audio.wav',
    data: new Uint8Array([1, 2, 3]).buffer,
  });
  const { result, engine } = harness();
  const load = vi.spyOn(engine, 'load').mockImplementation(() => {});
  await act(async () => result.current.project.open(details.project.id));
  let operation: Promise<void> = Promise.resolve();
  await act(async () => {
    operation = result.current.project.importAsset(
      'ORIGINAL',
      'MANAGED',
      new File(['RIFF'], 'audio.wav'),
    );
  });
  act(() => result.current.project.cancel());
  expect(result.current.project.busy).toBe(true);
  await act(async () => {
    pending.resolve({ asset, duplicate: false });
    await operation;
  });
  expect(result.current.project.busy).toBe(false);
  expect(result.current.project.audioAssetId).toBeNull();
  expect(load).not.toHaveBeenCalled();
  engine.dispose();
});

it('drop의 취소 요청은 실제 종료까지 잠금을 유지하고 이전 악보를 보존한다', async () => {
  const details = projectFixture();
  const asset = {
    ...details.assets[0]!,
    kind: 'SCORE_IMPORT' as const,
    storage: 'MANAGED' as const,
    available: true,
  };
  const pending = deferred<{ asset: typeof asset; duplicate: boolean }>();
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  vi.mocked(projectApi.importDroppedScore).mockReturnValue(pending.promise);
  vi.mocked(projectApi.read).mockResolvedValue({
    name: 'custom.json',
    data: new TextEncoder().encode(jsonScore).buffer,
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  const previous = scoreEditingFixture();
  act(() => result.current.setSession(previous));
  let operation: Promise<void> = Promise.resolve();
  await act(async () => {
    operation = result.current.project.importAsset(
      'SCORE_IMPORT',
      'MANAGED',
      new File([jsonScore], 'custom.json'),
    );
  });
  act(() => result.current.project.cancel());
  expect(result.current.project.busy).toBe(true);
  await act(async () =>
    result.current.project.importAsset(
      'SCORE_IMPORT',
      'MANAGED',
      new File([jsonScore], 'another.json'),
    ),
  );
  expect(projectApi.importDroppedScore).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve({ asset, duplicate: false });
    await operation;
  });
  expect(result.current.project.busy).toBe(false);
  expect(result.current.session).toBe(previous);
  engine.dispose();
});

it('drop의 외부 참조와 미저장 확인 거절은 native 저장을 시작하지 않는다', async () => {
  const confirmation = vi.fn().mockReturnValue(true);
  const details = projectFixture();
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  const { result, engine } = harness(confirmation);
  await act(async () => result.current.project.open(details.project.id));
  const file = new File([jsonScore], 'custom.json');
  await act(async () =>
    result.current.project.importAsset('SCORE_IMPORT', 'REFERENCE', file),
  );
  confirmation.mockReturnValue(false);
  await act(async () =>
    result.current.project.importAsset('SCORE_IMPORT', 'MANAGED', file),
  );
  expect(projectApi.importDroppedScore).not.toHaveBeenCalled();
  expect(projectApi.import).not.toHaveBeenCalled();
  engine.dispose();
});
it.each(['copy', 'practice', 'performance'] as const)(
  '%s 화면은 저장과 같은 프로젝트 재열기 후 유지하고 라이브러리 열기는 생성 모드를 따른다',
  async (mode) => {
    const details = projectFixture();
    const initial = scoreEditingFixture();
    if (!details.revision) throw new Error('저장 버전 필요');
    details.project.mode = mode === 'practice' ? 'performance' : 'practice';
    details.revision.score = initial.document;
    vi.mocked(projectApi.open).mockResolvedValue(details);
    vi.mocked(projectApi.read).mockResolvedValue({
      name: '원본.musicxml',
      data: new Uint8Array(initial.originalBytes).buffer,
    });
    vi.mocked(projectApi.save).mockResolvedValue(details.revision);
    const { result, engine } = harness();
    window.location.hash = '#/library';
    await act(async () => result.current.project.open(details.project.id));
    expect(window.location.hash).toBe(`#/${details.project.mode}`);
    window.location.hash = `#/${mode}`;
    await act(async () => result.current.project.save());
    expect(window.location.hash).toBe(`#/${mode}`);
    expect(result.current.project.scoreSaved).toBe(true);
    await act(async () => result.current.project.open(details.project.id));
    expect(window.location.hash).toBe(`#/${mode}`);
    window.location.hash = '#/library';
    await act(async () => result.current.project.open(details.project.id));
    expect(window.location.hash).toBe(`#/${details.project.mode}`);
    engine.dispose();
  },
);

it('같은 프로젝트 재열기 실패·취소·늦은 성공은 현재 화면을 이동시키지 않는다', async () => {
  const details = projectFixture();
  vi.mocked(projectApi.open).mockResolvedValue({ ...details, revision: null });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  window.location.hash = '#/copy';
  vi.mocked(projectApi.open).mockRejectedValueOnce(new Error('읽기 실패'));
  await act(async () => result.current.project.open(details.project.id));
  expect(window.location.hash).toBe('#/copy');
  const canceled = deferred<typeof details>();
  vi.mocked(projectApi.open).mockReturnValueOnce(canceled.promise);
  let opening: Promise<void>;
  act(() => {
    opening = result.current.project.open(details.project.id);
  });
  await waitFor(() => expect(result.current.project.busy).toBe(true));
  act(() => result.current.project.cancel());
  await act(async () => {
    canceled.resolve(details);
    await opening;
  });
  expect(window.location.hash).toBe('#/copy');
  const late = deferred<typeof details>();
  vi.mocked(projectApi.open).mockReturnValueOnce(late.promise);
  act(() => {
    opening = result.current.project.open(details.project.id);
  });
  await waitFor(() => expect(result.current.project.busy).toBe(true));
  window.location.hash = '#/settings';
  await act(async () => {
    late.resolve({ ...details, revision: null });
    await opening;
  });
  expect(window.location.hash).toBe('#/settings');
  engine.dispose();
});

it('프로젝트 압축 악보 한도·읽기 직후 취소는 기존 문서/원본/저장 버전을 보존한다', async () => {
  const details = projectFixture();
  vi.mocked(projectApi.open).mockResolvedValue({ ...details, revision: null });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  const source = scoreEditingFixture();
  act(() => result.current.setSession(source));
  const archive = new Uint8Array([66, 67, 70, 90, 0, 0, 0, 0]);
  new DataView(archive.buffer).setUint32(4, 32 * 1024 * 1024 + 1, true);
  const asset = { ...details.assets[0]!, name: '과다.gpx' };
  vi.mocked(projectApi.import).mockResolvedValue({ asset, duplicate: false });
  vi.mocked(projectApi.read).mockResolvedValue({
    name: asset.name,
    data: archive.buffer,
  });
  await act(async () =>
    result.current.project.importAsset('SCORE_IMPORT', 'MANAGED'),
  );
  expect(result.current.project.error).toContain('32MiB');
  expect(result.current.session).toBe(source);
  vi.mocked(projectApi.read).mockImplementationOnce(async () => {
    result.current.project.cancel();
    return { name: asset.name, data: archive.buffer };
  });
  await act(async () =>
    result.current.project.importAsset('SCORE_IMPORT', 'MANAGED'),
  );
  expect(result.current.project.error).toBeNull();
  expect(result.current.session).toBe(source);
  expect(projectApi.save).not.toHaveBeenCalled();
  engine.dispose();
});
it('추가 기타의 음표·역할·선택과 기존 싱크를 저장/재열기하고 원본·이전 버전은 보존한다', async () => {
  const details = projectFixture();
  const initial = scoreEditingFixture();
  if (!details.revision) throw new Error('저장 버전 필요');
  details.revision.score = initial.document;
  const oldRevision = JSON.stringify(details.revision);
  vi.mocked(projectApi.open).mockResolvedValue(details);
  vi.mocked(projectApi.read).mockResolvedValue({
    name: '원본.musicxml',
    data: new Uint8Array(initial.originalBytes).buffer,
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  const source = result.current.session;
  if (!source) throw new Error('원본 세션 필요');
  const appended = editStructure(source.document, { kind: 'ADD_GUITAR_TRACK' });
  const added = editStructure(appended, {
    kind: 'SET_TRACK_NAME',
    trackId: appended.tracks[1]!.id,
    name: '내 리듬 기타',
  });
  const track = added.tracks[1];
  if (!track) throw new Error('추가 트랙 필요');
  const edited = editNote(
    {
      ...added,
      tracks: added.tracks.map((t) =>
        t.id === track.id ? { ...t, role: 'RHYTHM' } : t,
      ),
    },
    {
      kind: 'ADD',
      trackId: track.id,
      value: { startTick: 0, durationTicks: 480, stringIndex: 1, fret: 3 },
    },
  );
  act(() =>
    result.current.setSession(
      selectScoreTrack(
        {
          ...source,
          ...renderNormalized(edited),
          document: edited,
        },
        track.id,
      ),
    ),
  );
  const revision = {
    ...details.revision,
    score: edited,
    revision: details.revision.revision + 1,
    revisionId: '00000000-0000-4000-8000-000000000099',
    workspace: {
      ...details.revision.workspace,
      activeTrackIndex: 1,
      activePerformanceTrackId: track.id,
    },
  };
  vi.mocked(projectApi.save).mockResolvedValue(revision);
  await act(async () => result.current.project.save());
  expect(vi.mocked(projectApi.save).mock.calls[0]?.[4]).toMatchObject({
    activeTrackIndex: 1,
    activePerformanceTrackId: track.id,
  });
  vi.mocked(projectApi.open).mockResolvedValue({ ...details, revision });
  await act(async () => result.current.project.open(details.project.id));
  expect(result.current.session?.document).toEqual(edited);
  expect(result.current.session?.document.tracks[1]?.role).toBe('RHYTHM');
  expect(result.current.session?.document.tracks[1]?.name).toBe('내 리듬 기타');
  expect(result.current.session?.activePerformanceTrackId).toBe(track.id);
  expect(result.current.session?.activeTrackIndex).toBe(1);
  expect(result.current.session?.document.syncAnchors).toEqual(
    source.document.syncAnchors,
  );
  expect(Array.from(result.current.session?.originalBytes ?? [])).toEqual(
    Array.from(initial.originalBytes),
  );
  expect(JSON.stringify(details.revision)).toBe(oldRevision);
  expect(result.current.project.scoreSaved).toBe(true);
  engine.dispose();
});
it('선택적 자동 저장은 기존 저장 명령으로 새 버전을 만들고 원본·이전 문서를 유지한다', async () => {
  const details = projectFixture();
  const initial = scoreEditingFixture();
  if (!details.revision) throw new Error('저장 버전 fixture 필요');
  details.revision.score = initial.document;
  vi.mocked(projectApi.open).mockResolvedValue(details);
  vi.mocked(projectApi.read).mockResolvedValue({
    name: '원본.musicxml',
    data: new Uint8Array(initial.originalBytes).buffer,
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  const source = result.current.session;
  const first = source?.document.tracks[0]?.notes[0];
  if (!source || !first) throw new Error('원본 세션 필요');
  const edited = editNote(source.document, {
    kind: 'UPDATE',
    trackId: first.trackId,
    noteId: first.id,
    value: { startTick: 0, durationTicks: 960, stringIndex: 1, fret: 4 },
  });
  const revision = {
    ...details.revision,
    revision: details.revision.revision + 1,
    revisionId: '00000000-0000-4000-8000-000000000099',
    score: edited,
  };
  vi.mocked(projectApi.save).mockResolvedValue(revision);
  vi.useFakeTimers();
  try {
    act(() => {
      result.current.autosave.setEnabled(true);
      result.current.setSession({ ...source, document: edited });
    });
    await act(async () => vi.advanceTimersByTime(29999));
    expect(projectApi.save).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(projectApi.save).toHaveBeenCalledTimes(1);
    expect(vi.mocked(projectApi.save).mock.calls[0]?.slice(0, 4)).toEqual([
      details.project.id,
      details.project.revision,
      source.originalAssetId,
      edited,
    ]);
    expect(result.current.project.scoreSaved).toBe(true);
    expect(result.current.session?.savedRevision?.revisionId).toBe(
      revision.revisionId,
    );
    expect(result.current.session?.originalBytes).toBe(source.originalBytes);
    expect(source.document.tracks[0]?.notes[0]?.fret).not.toBe(4);
    await act(async () => vi.advanceTimersByTime(120000));
    expect(projectApi.save).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
    engine.dispose();
  }
});
it('프로젝트 JSON 선택·편집본 저장/재열기는 원래 ID·역할·싱크와 JSON 원본을 보존한다', async () => {
  const details = projectFixture();
  if (!details.revision || !details.assets[0])
    throw new Error('프로젝트 fixture 없음');
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  const asset = {
    ...details.assets[0],
    storage: 'MANAGED' as const,
    name: '직접 작성.json',
  };
  vi.mocked(projectApi.import).mockResolvedValue({ asset, duplicate: false });
  const encoded = new TextEncoder().encode(jsonScore);
  vi.mocked(projectApi.read).mockResolvedValue({
    name: asset.name,
    data: encoded.buffer,
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  await act(async () =>
    result.current.project.importAsset('SCORE_IMPORT', 'MANAGED'),
  );
  const source = result.current.session;
  if (!source) throw new Error('JSON 세션 없음');
  expect(source.document.tracks[0]?.id).toBe('lead-json');
  const edited = editNote(source.document, {
    kind: 'UPDATE',
    trackId: 'lead-json',
    noteId: 'lead-1',
    value: { startTick: 0, durationTicks: 960, stringIndex: 1, fret: 4 },
  });
  act(() => result.current.setSession({ ...source, document: edited }));
  const revision = {
    ...details.revision,
    score: edited,
    workspace: {
      ...details.revision.workspace,
      activeTrackIndex: 0,
      activePerformanceTrackId: 'lead-json',
    },
  };
  vi.mocked(projectApi.save).mockResolvedValue(revision);
  await act(async () => result.current.project.save());
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision,
    assets: [asset],
  });
  await act(async () => result.current.project.open(details.project.id));
  expect(result.current.session?.document).toEqual(edited);
  expect(result.current.session?.document.tracks[0]?.role).toBe('LEAD');
  expect(result.current.session?.document.syncAnchors[0]?.audioTimeMs).toBe(
    5000,
  );
  expect(result.current.session?.document.tracks[0]?.notes[0]?.fret).toBe(4);
  expect(Array.from(result.current.session?.originalBytes ?? [])).toEqual(
    Array.from(encoded),
  );
  expect(result.current.project.scoreSaved).toBe(true);
  engine.dispose();
});
it('빈 프로젝트 악보는 명시적 확인 후 연결하며 저장·재열기와 이전 자산을 유지한다', async () => {
  const details = projectFixture();
  const allow = vi.fn().mockResolvedValue(true);
  vi.mocked(projectApi.open).mockResolvedValue({ ...details, revision: null });
  const asset = {
    ...details.assets[0]!,
    id: '00000000-0000-4000-8000-0000000000f5',
    storage: 'MANAGED' as const,
    name: '새 기타 악보.musicxml',
  };
  vi.mocked(projectApi.createBlankScore).mockResolvedValue(asset);
  const encoded = new TextEncoder().encode(blankXml);
  vi.mocked(projectApi.read).mockResolvedValue({
    name: asset.name,
    data: encoded.buffer,
  });
  const { result, engine } = harness(allow);
  await act(async () => result.current.project.open(details.project.id));
  await act(async () => result.current.project.createBlankScore());
  expect(result.current.project.details?.assets.map((a) => a.id)).toEqual([
    details.assets[0]?.id,
    asset.id,
  ]);
  const session = result.current.session;
  if (!session || !details.revision) throw new Error('빈 세션 없음');
  expect(session.document.tracks[0]?.notes).toEqual([]);
  expect(session.originalAssetId).toBe(asset.id);
  expect(session.savedRevision).toBeUndefined();
  const revision = {
    ...details.revision,
    score: session.document,
    scoreAssetId: asset.id,
    workspace: {
      ...details.revision.workspace,
      activeTrackIndex: 0,
      audioAssetId: null,
    },
  };
  vi.mocked(projectApi.save).mockResolvedValue(revision);
  await act(async () => result.current.project.save());
  expect(result.current.project.scoreSaved).toBe(true);
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision,
    assets: [asset],
  });
  await act(async () => result.current.project.open(details.project.id));
  expect(result.current.session?.document.tracks[0]?.notes).toEqual([]);
  expect(result.current.project.scoreSaved).toBe(true);
  engine.dispose();
});
it('빈 악보 확인 거절·쓰기 실패·취소 뒤 늦은 응답은 기존 악보를 바꾸지 않는다', async () => {
  const details = projectFixture();
  const allow = vi.fn().mockResolvedValue(true);
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  const { result, engine } = harness(allow);
  await act(async () => result.current.project.open(details.project.id));
  const previous = scoreEditingFixture();
  act(() => result.current.setSession(previous));
  allow.mockResolvedValueOnce(false);
  await act(async () => result.current.project.createBlankScore());
  expect(projectApi.createBlankScore).not.toHaveBeenCalled();
  expect(result.current.session).toBe(previous);
  vi.mocked(projectApi.createBlankScore).mockRejectedValueOnce(
    new Error('private/path'),
  );
  await act(async () => result.current.project.createBlankScore());
  expect(result.current.session).toBe(previous);
  expect(result.current.project.error).not.toMatch(/private/);
  const pending =
    deferred<Awaited<ReturnType<typeof projectApi.createBlankScore>>>();
  vi.mocked(projectApi.createBlankScore).mockReturnValueOnce(pending.promise);
  let work: Promise<void> | undefined;
  act(() => {
    work = result.current.project.createBlankScore();
  });
  await waitFor(() => expect(result.current.project.busy).toBe(true));
  act(() => result.current.project.cancel());
  vi.mocked(projectApi.read).mockRejectedValueOnce(
    new DOMException('취소', 'AbortError'),
  );
  await act(async () => {
    pending.resolve({ ...details.assets[0]!, storage: 'MANAGED' });
    await work;
  });
  expect(result.current.session).toBe(previous);
  expect(result.current.project.details?.assets).toEqual([]);
  engine.dispose();
});
it('교체 확인 취소·실패는 프로젝트 열기/생성/악보 선택과 현재 문서를 바꾸지 않는다', async () => {
  const allow = vi.fn(() => true);
  const current = projectFixture();
  vi.mocked(projectApi.open).mockResolvedValue({
    ...current,
    revision: null,
    assets: [],
  });
  const { result, engine } = harness(allow);
  await act(async () => result.current.project.open(current.project.id));
  const edited = scoreEditingFixture();
  act(() => result.current.setSession(edited));
  allow.mockReturnValue(false);
  await act(async () => result.current.project.open(current.project.id));
  await act(async () => result.current.project.create('새 문맥', '', 'copy'));
  await act(async () =>
    result.current.project.importAsset('SCORE_IMPORT', 'MANAGED'),
  );
  expect(projectApi.open).toHaveBeenCalledTimes(1);
  expect(projectApi.create).not.toHaveBeenCalled();
  expect(projectApi.import).not.toHaveBeenCalled();
  expect(result.current.session).toBe(edited);
  expect(result.current.project.details?.project.id).toBe(current.project.id);
  allow.mockImplementation(() => {
    throw new Error('확인 실패');
  });
  await act(async () => result.current.project.open(current.project.id));
  expect(result.current.project.error).toMatch(/기존 편집을 유지/);
  expect(result.current.session).toBe(edited);
  allow.mockReturnValue(true);
  await act(async () => result.current.project.open(current.project.id));
  expect(projectApi.open).toHaveBeenCalledTimes(2);
  expect(result.current.session).toBeNull();
  engine.dispose();
});
it('보관 취소 뒤 실제 완료까지 잠그고 현재 작업 공간은 교체하지 않는다', async () => {
  const current = projectFixture();
  vi.mocked(projectApi.open).mockResolvedValue({
    ...current,
    revision: null,
    assets: [],
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(current.project.id));
  const edited = scoreEditingFixture();
  act(() =>
    result.current.setSession({
      ...edited,
      document: { ...edited.document, title: '미저장 편집 유지' },
    }),
  );
  const before = result.current.session;
  const other = {
    ...current.project,
    id: '00000000-0000-4000-8000-0000000000f1',
    title: '다른 프로젝트',
  };
  const saved: TrashedProject = {
    project: other,
    trashId: '00000000-0000-4000-8000-0000000000f2',
    trashedAtMs: 42,
  };
  const pending = deferred<TrashedProject>();
  vi.mocked(projectTrashApi.trash).mockReturnValue(pending.promise);
  let mutation: Promise<void> | undefined;
  act(() => {
    mutation = result.current.project.trashProject(other);
  });
  expect(result.current.project.busy).toBe(true);
  act(() => result.current.project.cancel());
  expect(result.current.project.busy).toBe(true);
  await act(async () => result.current.project.create('차단', '', 'practice'));
  expect(projectApi.create).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve(saved);
    await mutation;
  });
  expect(result.current.project.busy).toBe(false);
  expect(result.current.project.details?.project.id).toBe(current.project.id);
  expect(result.current.session).toBe(before);
  expect(result.current.project.notice).toMatch(/보관했습니다/);
  expect(projectTrashApi.list).toHaveBeenCalled();
  engine.dispose();
});
it('현재 프로젝트 보관은 확인 취소·실패·작업 취소 때 문서를 보존하고 성공 후에만 닫는다', async () => {
  const details = projectFixture();
  vi.mocked(projectApi.open).mockResolvedValue({
    ...details,
    revision: null,
    assets: [],
  });
  const confirm = vi.fn(() => true);
  const { result, engine } = harness(confirm);
  await act(async () => result.current.project.open(details.project.id));
  const edited = scoreEditingFixture();
  act(() => result.current.setSession(edited));
  confirm.mockReturnValue(false);
  await act(async () => result.current.project.trashProject(details.project));
  expect(projectTrashApi.trash).not.toHaveBeenCalled();
  expect(result.current.session).toBe(edited);
  confirm.mockReturnValue(true);
  vi.mocked(projectTrashApi.trash).mockRejectedValueOnce(
    new Error('PROJECT_IN_USE'),
  );
  await act(async () => result.current.project.trashProject(details.project));
  expect(result.current.session).toBe(edited);
  expect(result.current.project.details?.project.id).toBe(details.project.id);
  expect(result.current.project.error).toMatch(/연습·녹음/);
  vi.mocked(projectTrashApi.trash).mockRejectedValueOnce(
    new DOMException('취소', 'AbortError'),
  );
  await act(async () => result.current.project.trashProject(details.project));
  expect(result.current.session).toBe(edited);
  expect(result.current.project.details?.project.id).toBe(details.project.id);
  const pending = deferred<TrashedProject>();
  vi.mocked(projectTrashApi.trash).mockReturnValueOnce(pending.promise);
  let mutation: Promise<void> | undefined;
  act(() => {
    mutation = result.current.project.trashProject(details.project);
  });
  expect(result.current.session).toBe(edited);
  expect(result.current.project.busy).toBe(true);
  await act(async () => {
    pending.resolve({
      project: details.project,
      trashId: '00000000-0000-4000-8000-0000000000f2',
      trashedAtMs: 42,
    });
    await mutation;
  });
  expect(result.current.session).toBeNull();
  expect(result.current.project.details).toBeNull();
  expect(result.current.project.audioAssetId).toBeNull();
  expect(engine.getSnapshot().status).toBe('empty');
  engine.dispose();
});
it('복원과 오래된 목록 응답은 현재 프로젝트/악보를 자동으로 열지 않는다', async () => {
  const { result, engine } = harness();
  const item: TrashedProject = {
    project: projectFixture().project,
    trashId: '00000000-0000-4000-8000-0000000000f2',
    trashedAtMs: 42,
  };
  const old = deferred<TrashedProject[]>();
  vi.mocked(projectTrashApi.list)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue([item]);
  let first: Promise<void> | undefined;
  act(() => {
    first = result.current.project.refreshTrash();
  });
  await act(async () => result.current.project.refreshTrash());
  await act(async () => {
    old.resolve([]);
    await first;
  });
  expect(result.current.project.trashedProjects).toEqual([item]);
  vi.mocked(projectTrashApi.restore).mockResolvedValue(item.project);
  vi.mocked(projectTrashApi.list).mockResolvedValue([]);
  await act(async () => result.current.project.restoreProject(item));
  expect(result.current.project.trashedProjects).toEqual([]);
  expect(result.current.project.details).toBeNull();
  expect(result.current.session).toBeNull();
  expect(projectApi.open).not.toHaveBeenCalled();
  engine.dispose();
});
it('편집 리비전 재열기는 원본 asset을 보존하며 실제 새 음표 렌더를 복원한다', async () => {
  const initial = scoreEditingFixture();
  const track = initial.document.tracks[0];
  const note = track?.notes[0];
  const details = projectFixture();
  if (!track || !note || !details.revision)
    throw new Error('편집 fixture 필요');
  const document = editNote(initial.document, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: { startTick: 0, durationTicks: 960, stringIndex: 1, fret: 5 },
  });
  document.tempoMap = document.tempoMap.map((t) => ({
    bpm: t.bpm,
    tick: t.tick,
  }));
  details.revision = { ...details.revision, score: document };
  vi.mocked(projectApi.open).mockResolvedValue(details);
  vi.mocked(projectApi.read).mockResolvedValue({
    name: 'original.musicxml',
    data: new Uint8Array(initial.originalBytes).buffer,
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  expect(result.current.project.error).toBeNull();
  expect(result.current.session?.document).toBe(document);
  expect(
    result.current.session?.score.tracks[0]?.staves[0]?.bars[0]?.voices[0]
      ?.beats[0]?.notes[0]?.fret,
  ).toBe(5);
  const bytes = result.current.session?.originalBytes;
  expect(bytes?.length).toBe(initial.originalBytes.length);
  expect(
    bytes?.every((byte, index) => byte === initial.originalBytes[index]),
  ).toBe(true);
  expect(result.current.session?.savedRevision?.revisionId).toBe(
    details.revision.revisionId,
  );
  expect(result.current.project.scoreSaved).toBe(true);
  engine.dispose();
});
it('동시 생성은 하나만 실행하고 늦은 초기 목록이 생성 프로젝트를 지우지 않는다', async () => {
  const initial = deferred<ProjectSummary[]>();
  vi.mocked(projectApi.list).mockReturnValueOnce(initial.promise);
  const fixture = projectFixture();
  const created = { ...fixture.project, revision: 0, revisionId: null };
  vi.mocked(projectApi.create).mockResolvedValue(created);
  const { result, engine } = harness();
  await act(async () => {
    await Promise.all([
      result.current.project.create('곡', '', 'practice'),
      result.current.project.create('곡', '', 'practice'),
    ]);
  });
  expect(projectApi.create).toHaveBeenCalledTimes(1);
  expect(result.current.project.projects).toHaveLength(1);
  await act(async () => initial.resolve([]));
  expect(result.current.project.projects[0]?.id).toBe(created.id);
  engine.dispose();
});
it('취소 뒤 늦게 도착한 프로젝트는 현재 작업 공간을 바꾸지 않는다', async () => {
  const loaded = deferred<ReturnType<typeof projectFixture>>();
  vi.mocked(projectApi.open).mockReturnValue(loaded.promise);
  const { result, engine } = harness();
  let opening: Promise<void> | undefined;
  act(() => {
    opening = result.current.project.open(projectFixture().project.id);
  });
  act(() => result.current.project.cancel());
  await act(async () => {
    loaded.resolve({
      ...projectFixture(),
      revision: null,
      assets: [],
      project: { ...projectFixture().project, revision: 0, revisionId: null },
    });
    await opening;
  });
  expect(result.current.project.details).toBeNull();
  expect(result.current.session).toBeNull();
  engine.dispose();
});
it('누락 원본 프로젝트도 정보와 재연결 상태를 표시하고 임의 악보를 만들지 않는다', async () => {
  const fixture = projectFixture();
  fixture.assets = fixture.assets.map((a) => ({ ...a, available: false }));
  vi.mocked(projectApi.open).mockResolvedValue(fixture);
  const { result, engine } = harness();
  await act(async () => result.current.project.open(fixture.project.id));
  await waitFor(() =>
    expect(result.current.project.details?.assets[0]?.available).toBe(false),
  );
  expect(projectApi.read).not.toHaveBeenCalled();
  expect(result.current.session).toBeNull();
  expect(result.current.project.notice).toContain('누락된 원본');
  engine.dispose();
});
it('누락 음원 때문에 저장된 파일 연결·재생 설정을 지우지 않는다', async () => {
  const fixture = projectFixture();
  if (!fixture.revision) throw new Error('fixture');
  const audioId = '00000000-0000-4000-8000-000000000003';
  fixture.revision.workspace.audioAssetId = audioId;
  fixture.assets = [
    ...fixture.assets.map((a) => ({ ...a, available: false })),
    {
      id: audioId,
      projectId: fixture.project.id,
      kind: 'ORIGINAL',
      storage: 'REFERENCE',
      name: '원본.wav',
      sha256: 'b'.repeat(64),
      bytes: 1024,
      available: false,
    },
  ];
  vi.mocked(projectApi.open).mockResolvedValue(fixture);
  const { result, engine } = harness();
  await act(async () => result.current.project.open(fixture.project.id));
  expect(result.current.project.audioAssetId).toBe(audioId);
  expect(engine.getSnapshot().status).toBe('empty');
  expect(result.current.project.details?.revision?.workspace.positionMs).toBe(
    500,
  );
  expect(projectApi.read).not.toHaveBeenCalled();
  engine.dispose();
});

it('이전 원본 악보를 열면 미지원 주법만 복원하고 저장 revision은 보존·재저장을 안내한다', async () => {
  const original = scoreEditingFixture().originalBytes;
  const xml = new TextDecoder()
    .decode(original)
    .replace(
      '</technical>',
      '<bend><bend-alter>2</bend-alter></bend></technical>',
    );
  const data = new TextEncoder().encode(xml);
  const score = importScore(data);
  const lookup = buildPlaybackLookup(score);
  const legacy = normalizeScore(score, lookup);
  const first = legacy.tracks[0]?.notes[0];
  if (!first) throw new Error('자체 벤딩 음표 필요');
  expect(first.judgementSupport).toBe('UNSUPPORTED');
  delete first.judgementSupport;
  const before = JSON.stringify(legacy);
  const details = projectFixture();
  if (!details.revision) throw new Error('저장 fixture 필요');
  details.revision.score = legacy;
  vi.mocked(projectApi.open).mockResolvedValue(details);
  vi.mocked(projectApi.read).mockResolvedValue({
    name: '자체-bend.musicxml',
    data: data.buffer,
  });
  const { result, engine } = harness();
  await act(async () => result.current.project.open(details.project.id));
  expect(result.current.project.error).toBeNull();
  expect(result.current.session?.document.tracks[0]?.notes[0]).toEqual({
    ...first,
    judgementSupport: 'UNSUPPORTED',
  });
  expect(result.current.session?.savedRevision?.document).toBe(legacy);
  expect(JSON.stringify(legacy)).toBe(before);
  expect(result.current.project.scoreSaved).toBe(false);
  expect(result.current.project.notice).toContain('채점 전 프로젝트를 저장');
  expect(projectApi.save).not.toHaveBeenCalled();
  engine.dispose();
});

it('비동기 확인 대기 중에는 읽기·중복 생성이 없고 취소·문맥 변경·해제 뒤 승인을 폐기한다', async () => {
  const pending = deferred<boolean>();
  const confirm = vi.fn(() => pending.promise);
  const { result, engine, unmount } = harness(confirm);
  const source = scoreEditingFixture();
  act(() => result.current.setSession(source));
  let opening: Promise<void> | undefined;
  act(() => {
    opening = result.current.project.open(projectFixture().project.id);
  });
  expect(result.current.project.busy).toBe(true);
  expect(projectApi.open).not.toHaveBeenCalled();
  await act(async () => result.current.project.create('중복', '', 'copy'));
  expect(confirm).toHaveBeenCalledOnce();
  expect(projectApi.create).not.toHaveBeenCalled();
  act(() => result.current.project.cancel());
  await act(async () => {
    pending.resolve(true);
    await opening;
  });
  expect(projectApi.open).not.toHaveBeenCalled();
  expect(result.current.session).toBe(source);
  const changed = deferred<boolean>();
  confirm.mockReturnValue(changed.promise);
  act(() => {
    opening = result.current.project.open(projectFixture().project.id);
  });
  const next = {
    ...source,
    document: { ...source.document, title: '새 편집' },
  };
  act(() => result.current.setSession(next));
  await act(async () => {
    changed.resolve(true);
    await opening;
  });
  expect(projectApi.open).not.toHaveBeenCalled();
  expect(result.current.session).toBe(next);
  const late = deferred<boolean>();
  confirm.mockReturnValue(late.promise);
  act(() => {
    opening = result.current.project.open(projectFixture().project.id);
  });
  unmount();
  await act(async () => {
    late.resolve(true);
    await opening;
  });
  expect(projectApi.open).not.toHaveBeenCalled();
  engine.dispose();
});
