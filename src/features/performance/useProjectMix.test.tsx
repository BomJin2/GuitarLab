import { nativePlaybackApi } from '../player/nativeTransport';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { recordingApi } from '../recordings/recordings';
import {
  recordingFixture,
  recordingWaveFixture,
} from '../../test/recordingFixture';
import { mixApi, type MixDocument } from './mixing';
import { TakeMixPlayer } from './TakeMixPlayer';
import { useProjectMix } from './useProjectMix';
import {
  separationApi,
  type SeparationPreview,
} from '../transcription/separation';
import { separationFixture } from '../../test/separationFixture';
import { importedStemsApi, type ImportedGuitarStem } from './importedStems';
import { freezeApi, type TakeRender } from './freeze';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mix-preview'),
    revokeObjectURL: vi.fn(),
  });
  const main = new PlayerEngine();
  const take = recordingFixture();
  const mix: MixDocument = {
    schemaVersion: 1,
    projectId: take.projectId,
    masterGain: 0.5,
    layers: [
      {
        kind: 'LOCAL_ASSET',
        id: take.transport?.backingAssetId ?? '',
        gain: 0.5,
        mute: false,
        solo: false,
        offsetMs: 0,
      },
      {
        kind: 'TAKE',
        id: take.id,
        gain: 0.5,
        mute: false,
        solo: false,
        offsetMs: 0,
      },
    ],
  };
  vi.spyOn(mixApi, 'load').mockResolvedValue(mix);
  vi.spyOn(recordingApi, 'list').mockResolvedValue([take]);
  vi.spyOn(recordingApi, 'read').mockResolvedValue(recordingWaveFixture());
  // Freeze 목록 실패는 이제 안내되므로 기본은 빈 목록으로 둡니다.
  vi.spyOn(freezeApi, 'list').mockResolvedValue([]);
  vi.spyOn(freezeApi, 'listBounces').mockResolvedValue([]);
  const prepare = vi
    .spyOn(TakeMixPlayer.prototype, 'prepare')
    .mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Context.Provider value={main}>{children}</Context.Provider>
  );
  const props = {
    projectId: take.projectId as string | undefined,
    backingId: take.transport?.backingAssetId ?? null,
    revisionId: take.scoreRevisionId,
    enabled: true,
  };
  return { main, take, mix, prepare, wrapper, props };
}

function importedFixture(projectId: string): ImportedGuitarStem {
  return {
    schemaVersion: 1,
    id: '00000000-0000-4000-8000-000000000077',
    projectId,
    name: 'DEMO 리드.wav',
    role: 'LEAD',
    origin: 'USER_IMPORTED',
    sampleRate: 48000,
    channels: 1,
    frames: 48000,
    durationMs: 1000,
    bytes: 192058,
    sha256: 'a'.repeat(64),
    peak: 0.5,
    createdAtMs: 1,
  };
}
it.each(['projectId', 'backingId', 'revisionId'] as const)(
  '%s 변경의 첫 반환부터 이전 믹스와 테이크를 숨긴다',
  async (field) => {
    const { main, mix, wrapper, props } = setup();
    const seen: ReturnType<typeof useProjectMix>[] = [];
    const hook = renderHook(
      (p) => {
        const state = useProjectMix(
          p.projectId,
          p.backingId,
          p.revisionId,
          p.enabled,
        );
        seen.push(state);
        return state;
      },
      { initialProps: props, wrapper },
    );
    await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
    vi.mocked(mixApi.load).mockImplementation(
      () => new Promise(() => undefined),
    );
    seen.length = 0;
    hook.rerender({ ...props, [field]: crypto.randomUUID() });
    expect(seen.length).toBeGreaterThan(0);
    expect(
      seen.every(
        (state) =>
          state.mix === null &&
          state.takes.length === 0 &&
          state.referenceTakeIds.length === 0,
      ),
    ).toBe(true);
    hook.unmount();
    main.dispose();
  },
);
it('프로젝트를 해제했다 다시 열어도 이전 조회·저장·수정 명령을 재사용하지 않는다', async () => {
  const { main, mix, wrapper, props } = setup();
  const save = vi.spyOn(mixApi, 'save').mockResolvedValue(mix);
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  const old = hook.result.current;
  hook.rerender({ ...props, projectId: undefined });
  hook.rerender(props);
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  const reads = vi.mocked(mixApi.load).mock.calls.length;
  await act(async () => {
    await old.refresh();
    await old.save();
    old.update({ ...mix, masterGain: 0.1 });
  });
  expect(mixApi.load).toHaveBeenCalledTimes(reads);
  expect(save).not.toHaveBeenCalled();
  expect(hook.result.current.mix).toEqual(mix);
  hook.unmount();
  main.dispose();
});
it('화면 이탈 뒤 이전 조회·저장 함수는 새 외부 작업을 시작하지 않는다', async () => {
  const { main, mix, wrapper, props } = setup();
  const save = vi.spyOn(mixApi, 'save').mockResolvedValue(mix);
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  const old = hook.result.current;
  hook.unmount();
  const reads = vi.mocked(mixApi.load).mock.calls.length;
  await act(async () => {
    await old.refresh();
    await old.save();
  });
  expect(mixApi.load).toHaveBeenCalledTimes(reads);
  expect(save).not.toHaveBeenCalled();
  main.dispose();
});
it('현재 컨트롤러도 다른 프로젝트 믹스로 교체하지 않는다', async () => {
  const { main, mix, wrapper, props } = setup();
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  act(() =>
    hook.result.current.update({ ...mix, projectId: crypto.randomUUID() }),
  );
  expect(hook.result.current.mix).toEqual(mix);
  expect(hook.result.current.error).toBeTruthy();
  hook.unmount();
  main.dispose();
});
it('현재 잠금이 바뀌면 이전 활성 함수로 저장하지 않는다', async () => {
  const { main, mix, wrapper, props } = setup();
  const save = vi.spyOn(mixApi, 'save').mockResolvedValue(mix);
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  const oldSave = hook.result.current.save;
  hook.rerender({ ...props, enabled: false });
  await act(async () => {
    await oldSave();
  });
  expect(save).not.toHaveBeenCalled();
  hook.unmount();
  main.dispose();
});
it('이전 취소 명령은 다시 연 프로젝트의 새 준비를 취소하지 않는다', async () => {
  const { main, mix, wrapper, props } = setup();
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  const oldCancel = hook.result.current.cancel;
  hook.rerender({ ...props, projectId: undefined });
  hook.rerender(props);
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  let finish!: (value: ArrayBuffer) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(recordingApi.read).mockImplementation(
    (_projectId, _takeId, current) => {
      signal = current;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  let work!: Promise<void>;
  act(() => {
    work = hook.result.current.prepare();
  });
  act(oldCancel);
  await act(async () => {
    finish(recordingWaveFixture());
    await work;
  });
  expect(signal?.aborted).toBe(false);
  expect(hook.result.current.prepared).toBe(true);
  hook.unmount();
  main.dispose();
});
it.each(['믹스', '테이크'] as const)(
  '다른 프로젝트의 %s 조회 결과를 표시하지 않는다',
  async (kind) => {
    const { main, mix, take, wrapper, props } = setup();
    const foreign = crypto.randomUUID();
    if (kind === '믹스')
      vi.mocked(mixApi.load).mockResolvedValue({ ...mix, projectId: foreign });
    else
      vi.mocked(recordingApi.list).mockResolvedValue([
        { ...take, projectId: foreign },
      ]);
    const hook = renderHook(
      (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
      { initialProps: props, wrapper },
    );
    await waitFor(() => expect(hook.result.current.error).toBeTruthy());
    expect(hook.result.current.mix).toBeNull();
    expect(hook.result.current.takes).toEqual([]);
    hook.unmount();
    main.dispose();
  },
);
it('프로젝트를 해제하면 이전 분리 목록도 지운다', async () => {
  const { main, mix, wrapper, props } = setup();
  vi.spyOn(separationApi, 'restore').mockResolvedValue({
    info: {
      ...separationFixture(),
      projectId: mix.projectId,
      assetId: props.backingId ?? '',
    },
    audio: [],
  });
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  await act(async () => {
    await hook.result.current.configureStems();
  });
  expect(hook.result.current.stems).toHaveLength(2);
  hook.rerender({ ...props, projectId: undefined });
  expect(hook.result.current.stems).toEqual([]);
  hook.unmount();
  main.dispose();
});
it('사용자 파일은 명시적으로 추가·출력·저장하고 준비 뒤 TAKE만 REC 참조로 제공한다', async () => {
  const { main, take, mix, prepare, wrapper, props } = setup();
  const stem = importedFixture(mix.projectId);
  const list = vi.spyOn(importedStemsApi, 'list').mockResolvedValue([stem]);
  const bytes = recordingWaveFixture();
  const read = vi
    .spyOn(importedStemsApi, 'read')
    .mockResolvedValue({ stem, bytes });
  const save = vi
    .spyOn(mixApi, 'save')
    .mockImplementation(async (value) => value);
  const render = vi.spyOn(mixApi, 'render').mockResolvedValue({
    bytes: recordingWaveFixture(),
    stats: {
      schemaVersion: 1,
      frames: 48000,
      sampleRate: 48000,
      channels: 1,
      peak: 0.5,
      limitedFrames: 0,
      frozenLayers: 0,
      bytes: 192058,
    },
  });
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  expect(list).not.toHaveBeenCalled();
  await act(async () => {
    await hook.result.current.refreshImported();
  });
  act(() =>
    hook.result.current.addImported('00000000-0000-4000-8000-000000000088'),
  );
  expect(hook.result.current.mix).toEqual(mix);
  act(() => hook.result.current.addImported(stem.id));
  const expected = hook.result.current.mix;
  expect(expected?.layers.at(-1)).toMatchObject({
    kind: 'IMPORTED_STEM',
    id: stem.id,
  });
  act(() => hook.result.current.addImported(stem.id));
  expect(hook.result.current.mix?.layers).toHaveLength(3);
  expect(save).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(hook.result.current.needsPreparation).toBe(true);
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(read).toHaveBeenCalledWith(
    mix.projectId,
    stem.id,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(prepare).toHaveBeenCalledWith(
    expected,
    [
      { take, bytes: expect.any(ArrayBuffer) },
      {
        kind: 'IMPORTED_STEM',
        stemId: stem.id,
        projectId: mix.projectId,
        bytes,
      },
    ],
    expect.any(AbortSignal),
  );
  expect(hook.result.current.prepared).toBe(true);
  expect(hook.result.current.needsPreparation).toBe(false);
  expect(hook.result.current.referenceTakeIds).toEqual([take.id]);
  await act(async () => {
    await hook.result.current.render();
    await hook.result.current.save();
  });
  expect(render).toHaveBeenCalledWith(
    expected,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(save).toHaveBeenCalledWith(expected);
  hook.unmount();
  main.dispose();
});

it('사용자 기타 목록 조회가 늦게 끝나도 프로젝트 교체 후 결과를 표시하지 않는다', async () => {
  const { main, mix, wrapper, props } = setup();
  let finish: ((value: ImportedGuitarStem[]) => void) | undefined;
  const list = vi.spyOn(importedStemsApi, 'list').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.refreshImported();
  });
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  hook.rerender({ ...props, projectId: undefined });
  await act(async () => {
    finish?.([importedFixture(mix.projectId)]);
    await pending;
  });
  expect(list.mock.calls[0]?.[1].aborted).toBe(true);
  expect(hook.result.current.importedStems).toEqual([]);
  expect(hook.result.current.mix).toBeNull();
  hook.unmount();
  main.dispose();
});

it.each(['실패', '합계 제한'] as const)(
  '사용자 파일 읽기 %s에서 준비와 REC 참조를 적용하지 않는다',
  async (mode) => {
    const { main, mix, prepare, wrapper, props } = setup();
    const stem = importedFixture(mix.projectId);
    const saved: MixDocument = {
      ...mix,
      layers: [
        ...mix.layers,
        {
          kind: 'IMPORTED_STEM',
          id: stem.id,
          gain: 0.5,
          mute: false,
          solo: false,
          offsetMs: 0,
        },
      ],
    };
    vi.mocked(mixApi.load).mockResolvedValue(saved);
    const read = vi.spyOn(importedStemsApi, 'read');
    if (mode === '실패')
      read.mockRejectedValue(new Error('IMPORTED_STEM_INVALID'));
    else
      read.mockResolvedValue({
        stem,
        // 512MiB를 실제로 할당하지 않고 합계 검사(읽은 직후)만 넘깁니다.
        bytes: { byteLength: 512 * 1024 * 1024 + 1 } as ArrayBuffer,
      });
    const hook = renderHook(
      (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
      { initialProps: props, wrapper },
    );
    await waitFor(() => expect(hook.result.current.mix).toEqual(saved));
    await act(async () => {
      await hook.result.current.prepare();
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(hook.result.current.prepared).toBe(false);
    expect(hook.result.current.needsPreparation).toBe(true);
    expect(hook.result.current.referenceTakeIds).toEqual([]);
    expect(hook.result.current.error).toBeTruthy();
    hook.unmount();
    main.dispose();
  },
);

it('사용자 파일 읽기 중 이탈하면 늦게 온 bytes로 재생을 준비하지 않는다', async () => {
  const { main, mix, prepare, wrapper, props } = setup();
  const stem = importedFixture(mix.projectId);
  const saved: MixDocument = {
    ...mix,
    layers: [
      {
        kind: 'IMPORTED_STEM',
        id: stem.id,
        gain: 1,
        mute: false,
        solo: false,
        offsetMs: 0,
      },
    ],
  };
  vi.mocked(mixApi.load).mockResolvedValue(saved);
  let finish:
    | ((value: { stem: ImportedGuitarStem; bytes: ArrayBuffer }) => void)
    | undefined;
  const read = vi.spyOn(importedStemsApi, 'read').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() =>
    expect(hook.result.current.mix?.layers.slice(1)).toEqual(saved.layers),
  );
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.prepare();
  });
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  hook.rerender({ ...props, enabled: false });
  await act(async () => {
    finish?.({ stem, bytes: recordingWaveFixture() });
    await pending;
  });
  expect(read.mock.calls[0]?.[2].aborted).toBe(true);
  expect(prepare).not.toHaveBeenCalled();
  expect(hook.result.current.prepared).toBe(false);
  expect(hook.result.current.referenceTakeIds).toEqual([]);
  hook.unmount();
  main.dispose();
});
it('명시적 준비 후에만 참조 테이크를 REC에 제공하고 mute·프로젝트 해제 시 제거한다', async () => {
  const { main, take, mix, prepare, wrapper, props } = setup();
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  expect(prepare).not.toHaveBeenCalled();
  expect(hook.result.current.referenceTakeIds).toEqual([]);
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(hook.result.current.referenceTakeIds).toEqual([take.id]);
  expect(hook.result.current.notice).toContain('정지 상태에서 REC');
  act(() =>
    hook.result.current.update({
      ...mix,
      layers: mix.layers.map((l) => ({ ...l, mute: true })),
    }),
  );
  expect(hook.result.current.referenceTakeIds).toEqual([]);
  hook.rerender({ ...props, projectId: undefined });
  expect(hook.result.current.mix).toBeNull();
  expect(hook.result.current.prepared).toBe(false);
  hook.unmount();
  main.dispose();
});
it('화면 이탈로 파일 읽기를 취소하면 늦게 끝난 준비를 적용하지 않는다', async () => {
  const { main, mix, prepare, wrapper, props } = setup();
  let finish: ((bytes: ArrayBuffer) => void) | undefined;
  vi.mocked(recordingApi.read).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.prepare();
  });
  await waitFor(() => expect(recordingApi.read).toHaveBeenCalledTimes(1));
  hook.rerender({ ...props, enabled: false });
  await act(async () => {
    finish?.(recordingWaveFixture());
    await pending;
  });
  expect(hook.result.current.prepared).toBe(false);
  expect(hook.result.current.referenceTakeIds).toEqual([]);
  expect(prepare).not.toHaveBeenCalled();
  hook.unmount();
  main.dispose();
});
it('프로젝트 교체 후 이전 목록 응답을 폐기한다', async () => {
  const { main, mix, wrapper, props } = setup();
  let resolveOld: ((mix: MixDocument | null) => void) | undefined;
  vi.mocked(mixApi.load).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  const next = {
    ...mix,
    projectId: '00000000-0000-4000-8000-000000000099',
    layers: [],
  };
  vi.mocked(mixApi.load).mockResolvedValue(next);
  vi.mocked(recordingApi.list).mockResolvedValue([]);
  hook.rerender({ ...props, projectId: next.projectId });
  await waitFor(() =>
    expect(hook.result.current.mix?.projectId).toBe(next.projectId),
  );
  await act(async () => {
    resolveOld?.(mix);
  });
  expect(hook.result.current.mix?.projectId).toBe(next.projectId);
  hook.unmount();
  main.dispose();
});

it('저장 분리 UUID로 재생을 준비하고 명시적 저장·렌더만 실행하며 STEM을 테이크 참조로 넘기지 않는다', async () => {
  const { main, mix, prepare, wrapper, props } = setup();
  const info = {
    ...separationFixture(),
    projectId: mix.projectId,
    assetId: props.backingId ?? '',
    // 고정 데이터의 분리 ID 하나가 반주 ID와 같아 겹치지 않게 바꿉니다.
    stems: separationFixture().stems.map((s, i) => ({
      ...s,
      id: `00000000-0000-4000-8000-00000000006${i}`,
    })),
  };
  const restore = vi
    .spyOn(separationApi, 'restore')
    .mockResolvedValue({ info, audio: [] });
  const analyze = vi.spyOn(separationApi, 'analyze');
  const readStem = vi
    .spyOn(mixApi, 'readStem')
    .mockResolvedValue(recordingWaveFixture());
  const save = vi.spyOn(mixApi, 'save').mockImplementation(async (v) => v);
  const render = vi.spyOn(mixApi, 'render').mockResolvedValue({
    bytes: recordingWaveFixture(),
    stats: {
      schemaVersion: 1,
      frames: 192000,
      sampleRate: 48000,
      channels: 1,
      peak: 0.5,
      limitedFrames: 0,
      frozenLayers: 0,
      bytes: 768058,
    },
  });
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  expect(restore).not.toHaveBeenCalled();
  await act(async () => {
    await hook.result.current.configureStems();
  });
  expect(restore).toHaveBeenCalledWith(
    { projectId: mix.projectId, assetId: props.backingId },
    expect.any(AbortSignal),
  );
  expect(analyze).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  // 반주 줄은 지우지 않고 음소거해 맨 앞에 남깁니다.
  expect(
    hook.result.current.mix?.layers.map((l) => [l.kind, l.id, l.mute]),
  ).toEqual([
    ['LOCAL_ASSET', props.backingId, true],
    ...info.stems.map((s) => ['STEM', s.id, false]),
  ]);
  expect(hook.result.current.needsPreparation).toBe(true);
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(readStem).toHaveBeenCalledTimes(2);
  expect(hook.result.current.prepared).toBe(true);
  expect(hook.result.current.needsPreparation).toBe(false);
  expect(hook.result.current.referenceTakeIds).toEqual([]);
  expect(prepare).toHaveBeenCalledWith(
    hook.result.current.mix,
    info.stems.map((s) => ({
      kind: 'STEM',
      stemId: s.id,
      projectId: mix.projectId,
      bytes: expect.any(ArrayBuffer),
    })),
    expect.any(AbortSignal),
  );
  await act(async () => {
    await hook.result.current.save();
    await hook.result.current.render();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(render).toHaveBeenCalledTimes(1);
  expect(hook.result.current.referenceTakeIds).toEqual([]);
  hook.unmount();
  main.dispose();
});

it('분리 조회 중 화면을 떠나면 늦은 결과로 믹스를 교체하지 않는다', async () => {
  const { main, mix, wrapper, props } = setup();
  let finish: ((value: SeparationPreview | null) => void) | undefined;
  vi.spyOn(separationApi, 'restore').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.configureStems();
  });
  await waitFor(() => expect(finish).toBeDefined());
  hook.rerender({ ...props, enabled: false });
  await act(async () => {
    finish?.({
      info: {
        ...separationFixture(),
        projectId: mix.projectId,
        assetId: props.backingId ?? '',
      },
      audio: [],
    });
    await pending;
  });
  expect(hook.result.current.mix).toEqual(mix);
  expect(hook.result.current.stems).toEqual([]);
  hook.unmount();
  main.dispose();
});

it('정확한 STEM 파일 읽기 중 화면 이탈은 늦은 준비를 폐기한다', async () => {
  const { main, mix, prepare, wrapper, props } = setup();
  const stemMix: MixDocument = {
    ...mix,
    layers: mix.layers.map((l) =>
      l.kind === 'TAKE' ? { ...l, kind: 'STEM' } : l,
    ),
  };
  vi.mocked(mixApi.load).mockResolvedValue(stemMix);
  let finish: ((value: ArrayBuffer) => void) | undefined;
  const read = vi.spyOn(mixApi, 'readStem').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(stemMix));
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.prepare();
  });
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  hook.rerender({ ...props, enabled: false });
  await act(async () => {
    finish?.(recordingWaveFixture());
    await pending;
  });
  expect(prepare).not.toHaveBeenCalled();
  expect(hook.result.current.prepared).toBe(false);
  hook.unmount();
  main.dispose();
});

it('믹스 준비 전에도 로컬 반주 음량·음소거를 바로 반영하고, 준비·이탈 시 원래 음량으로 되돌린다', async () => {
  const { main, mix, prepare, wrapper, props } = setup();
  const backing = {
    kind: 'LOCAL_ASSET' as const,
    id: props.backingId ?? '',
    gain: 0.5,
    mute: false,
    solo: false,
    offsetMs: 0,
  };
  vi.spyOn(mixApi, 'load').mockResolvedValue({
    ...mix,
    layers: [backing, ...mix.layers.slice(1)],
  });
  main.setVolume(0.8);
  let volumeAtPrepare = -1;
  prepare.mockImplementation(async () => {
    volumeAtPrepare = main.getSnapshot().volume;
  });
  const { result, rerender } = renderHook(
    (p: typeof props) =>
      useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { wrapper, initialProps: props },
  );
  await waitFor(() => expect(main.getSnapshot().volume).toBe(0.25));
  const current = result.current.mix;
  if (!current) throw new Error('mix not loaded');
  act(() =>
    result.current.update({
      ...current,
      layers: current.layers.map((l) =>
        l.kind === 'LOCAL_ASSET' ? { ...l, mute: true } : l,
      ),
    }),
  );
  expect(main.getSnapshot().volume).toBe(0);
  // 준비는 사용자의 원래 음량을 기준으로 시작합니다.
  await act(() => result.current.prepare());
  expect(volumeAtPrepare).toBe(0.8);
  act(() => result.current.clear());
  expect(main.getSnapshot().volume).toBe(0);
  rerender({ ...props, enabled: false });
  expect(main.getSnapshot().volume).toBe(0.8);
});
it('자동 옵션: 저장 믹스가 없으면 맞는 테이크를 넣고 멈춘 상태에서 한 번만 자동 준비한다', async () => {
  const { main, take, prepare, wrapper, props } = setup();
  const other = recordingFixture({
    id: '00000000-0000-4000-8000-000000000011',
    scoreRevisionId: '00000000-0000-4000-8000-000000000099',
  });
  vi.spyOn(mixApi, 'load').mockResolvedValue(null);
  vi.mocked(recordingApi.list).mockResolvedValue([take, other]);
  const { result, rerender } = renderHook(
    (p: { enabled: boolean }) =>
      useProjectMix(
        props.projectId,
        props.backingId,
        props.revisionId,
        p.enabled,
        { take: null, locked: false },
      ),
    { wrapper, initialProps: { enabled: true } },
  );
  await waitFor(() => expect(result.current.prepared).toBe(true));
  // 다른 리비전 테이크는 넣지 않습니다.
  expect(result.current.mix?.layers.map((l) => [l.kind, l.id])).toEqual([
    ['LOCAL_ASSET', props.backingId],
    ['TAKE', take.id],
  ]);
  expect(prepare).toHaveBeenCalledTimes(1);
  // 연결 해제 뒤 같은 구성은 다시 자동 준비하지 않습니다.
  act(() => result.current.clear());
  await act(async () => {});
  expect(result.current.prepared).toBe(false);
  expect(prepare).toHaveBeenCalledTimes(1);
  // 화면을 떠났다 돌아오면 풀린 준비를 같은 구성이라도 다시 자동 준비합니다.
  rerender({ enabled: false });
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.prepared).toBe(true));
  expect(prepare).toHaveBeenCalledTimes(2);
  main.dispose();
});
it('자동 옵션: 녹음이 끝난 새 테이크를 한 번만 넣고, 녹음 중·재생 중에는 준비하지 않는다', async () => {
  const { main, take, mix, prepare, wrapper, props } = setup();
  const backingOnly = {
    ...mix,
    layers: [
      {
        kind: 'LOCAL_ASSET' as const,
        id: props.backingId ?? '',
        gain: 0.5,
        mute: false,
        solo: false,
        offsetMs: 0,
      },
    ],
  };
  vi.spyOn(mixApi, 'load').mockResolvedValue(backingOnly);
  vi.mocked(recordingApi.list).mockResolvedValue([]);
  const fresh: typeof take = { ...take, state: 'RECORDING' };
  const hook = renderHook(
    (p: { take: typeof take | null; locked: boolean }) =>
      useProjectMix(
        props.projectId,
        props.backingId,
        props.revisionId,
        props.enabled,
        p,
      ),
    { wrapper, initialProps: { take: fresh, locked: true } },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(backingOnly));
  // 녹음 중인 테이크는 넣지 않습니다.
  expect(hook.result.current.mix?.layers).toHaveLength(1);
  vi.spyOn(main, 'getSnapshot').mockReturnValue({
    ...main.getSnapshot(),
    status: 'playing',
  });
  hook.rerender({ take, locked: false });
  await waitFor(() => expect(hook.result.current.mix?.layers).toHaveLength(2));
  expect(hook.result.current.takes.map((t) => t.id)).toEqual([take.id]);
  await act(async () => {});
  expect(prepare).not.toHaveBeenCalled();
  vi.mocked(main.getSnapshot).mockRestore();
  act(() => main.pause());
  await waitFor(() => expect(hook.result.current.prepared).toBe(true));
  // 사용자가 뺀 테이크는 다시 넣지 않습니다.
  const current = hook.result.current.mix;
  if (!current) throw new Error('mix not loaded');
  act(() =>
    hook.result.current.update(
      { ...current, layers: current.layers.slice(0, 1) },
      true,
    ),
  );
  hook.rerender({ take: { ...take }, locked: false });
  await act(async () => {});
  expect(hook.result.current.mix?.layers).toHaveLength(1);
  main.dispose();
});
it('이전 악보 버전 테이크도 같은 반주면 듣기용으로 준비하되 REC 참조에는 넣지 않는다', async () => {
  const { main, take, mix, prepare, wrapper, props } = setup();
  const old = {
    ...take,
    scoreRevisionId: '00000000-0000-4000-8000-000000000098',
  };
  vi.mocked(recordingApi.list).mockResolvedValue([old]);
  const { result } = renderHook(
    () =>
      useProjectMix(props.projectId, props.backingId, props.revisionId, true),
    { wrapper },
  );
  await waitFor(() => expect(result.current.mix).toEqual(mix));
  await act(() => result.current.prepare());
  expect(result.current.error).toBeNull();
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(result.current.prepared).toBe(true);
  expect(result.current.referenceTakeIds).toEqual([]);
  main.dispose();
});
it('반주 줄이 없는 저장 믹스는 음소거 반주를 맨 앞에 넣고, 이전 반주 ID는 현재 반주로 바꾼다', async () => {
  const { main, mix, wrapper, props } = setup();
  const [backing, takeLayer] = mix.layers;
  if (!backing || !takeLayer) throw new Error('fixture');
  vi.mocked(mixApi.load).mockResolvedValue({ ...mix, layers: [takeLayer] });
  const first = renderHook(
    () =>
      useProjectMix(props.projectId, props.backingId, props.revisionId, true),
    { wrapper },
  );
  await waitFor(() =>
    expect(first.result.current.mix?.layers).toEqual([
      { ...backing, mute: true },
      takeLayer,
    ]),
  );
  first.unmount();
  vi.mocked(mixApi.load).mockResolvedValue({
    ...mix,
    layers: [takeLayer, { ...backing, id: crypto.randomUUID(), gain: 0.3 }],
  });
  const second = renderHook(
    () =>
      useProjectMix(props.projectId, props.backingId, props.revisionId, true),
    { wrapper },
  );
  await waitFor(() =>
    expect(second.result.current.mix?.layers).toEqual([
      { ...backing, gain: 0.3 },
      takeLayer,
    ]),
  );
  second.unmount();
  main.dispose();
});
function frozenFixture(projectId: string, takeId: string): TakeRender {
  return {
    schemaVersion: 1,
    id: '00000000-0000-4000-8000-000000000088',
    projectId,
    takeId,
    kind: 'FREEZE',
    sampleRate: 48000,
    channels: 2,
    frames: 10,
    durationMs: 10 / 48,
    bytes: 124,
    sha256: 'b'.repeat(64),
    takeSha256: 'c'.repeat(64),
    pluginClassId: '56535441746235616D706C6974756265',
    pluginVersion: '5.10.4',
    latencyFrames: 7,
    tailFrames: 0,
    createdAtMs: 1,
  };
}
it('Freeze된 테이크는 캐시로 재생을 준비하고, 캐시가 바뀌었으면 원본으로 재생하며 실시간 AmpliTube 재생을 거부한다(docs/12 Freeze v1)', async () => {
  const { main, take, prepare, wrapper, props } = setup();
  const frozen = frozenFixture(take.projectId, take.id);
  vi.spyOn(freezeApi, 'list').mockResolvedValue([frozen]);
  const cache = new ArrayBuffer(124);
  const read = vi.spyOn(freezeApi, 'read').mockResolvedValue(cache);
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.freezes).toEqual([frozen]));
  await act(async () => {
    await hook.result.current.prepare();
  });
  const entries = prepare.mock.calls[0]?.[1] ?? [];
  expect(entries.find((e) => 'take' in e)?.bytes).toBe(cache);
  expect(recordingApi.read).not.toHaveBeenCalled();
  // 테이크가 바뀐 캐시는 그 레이어만 원본으로 재생하고 알립니다.
  read.mockRejectedValue({ code: 'FREEZE_STALE' });
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(recordingApi.read).toHaveBeenCalledTimes(1);
  expect(hook.result.current.notice).toContain('원본(DI)으로 재생');
  await act(async () => {
    await hook.result.current.setWetTake(take.id);
  });
  expect(hook.result.current.notice).toContain('이미 AmpliTube 톤');
  // Freeze 해제 뒤에는 목록을 다시 읽습니다.
  const unfreeze = vi.spyOn(freezeApi, 'unfreeze').mockResolvedValue(true);
  vi.mocked(freezeApi.list).mockResolvedValue([]);
  await act(async () => {
    await hook.result.current.unfreezeTake(take.id);
  });
  expect(unfreeze).toHaveBeenCalledWith(take.projectId, take.id);
  expect(hook.result.current.freezes).toEqual([]);
  expect(hook.result.current.notice).toContain('Unfreeze 완료');
  hook.unmount();
  main.dispose();
});
it('Bounce는 RENDER 레이어를 원본 다음에 넣고 원본 줄을 음소거하며, 준비 때 원본 테이크 시간축으로 재생한다(docs/12 Bounce v1)', async () => {
  const { main, take, mix, prepare, wrapper, props } = setup();
  vi.spyOn(freezeApi, 'list').mockResolvedValue([]);
  const made = {
    ...frozenFixture(take.projectId, take.id),
    id: '00000000-0000-4000-8000-000000000099',
    kind: 'BOUNCE' as const,
  };
  vi.spyOn(freezeApi, 'listBounces').mockResolvedValue([]);
  const bounce = vi.spyOn(freezeApi, 'bounce').mockResolvedValue(made);
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  vi.mocked(freezeApi.listBounces).mockResolvedValue([made]);
  await act(async () => {
    await hook.result.current.bounceTake(take.id);
  });
  expect(bounce).toHaveBeenCalledWith(
    take.projectId,
    take.id,
    expect.anything(),
    expect.anything(),
  );
  const layers = hook.result.current.mix?.layers ?? [];
  expect(layers.map((l) => [l.kind, l.mute])).toEqual([
    ['LOCAL_ASSET', false],
    ['TAKE', true],
    ['RENDER', false],
  ]);
  expect(hook.result.current.notice).toContain('원본 테이크 줄은 음소거');
  // 원본이 음소거여도 Bounce 줄 때문에 준비가 필요합니다(자동 준비·REC 판정).
  expect(hook.result.current.needsPreparation).toBe(true);
  const cache = new ArrayBuffer(124);
  vi.spyOn(freezeApi, 'readBounce').mockResolvedValue(cache);
  await act(async () => {
    await hook.result.current.prepare();
  });
  const entry = (prepare.mock.calls[0]?.[1] ?? []).find(
    (e) => 'kind' in e && e.kind === 'RENDER',
  );
  expect(entry && 'source' in entry ? entry.source.id : null).toBe(take.id);
  expect(entry?.bytes).toBe(cache);
  // 저장한 뒤 다시 열어도(RENDER만 들리는 믹스) 준비가 필요합니다.
  const saved = hook.result.current.mix;
  hook.unmount();
  if (!saved) throw new Error('믹스 필요');
  vi.mocked(mixApi.load).mockResolvedValue(saved);
  const reopened = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(reopened.result.current.mix).toEqual(saved));
  expect(reopened.result.current.needsPreparation).toBe(true);
  reopened.unmount();
  main.dispose();
});
it('Bounce 삭제: 사용 중이면 안내만 하고, 성공하면 화면 믹스에서도 그 줄을 뺀다(docs/12 Bounce 삭제·관리 v1)', async () => {
  const { main, take, mix, wrapper, props } = setup();
  const made = {
    ...frozenFixture(take.projectId, take.id),
    id: '00000000-0000-4000-8000-000000000099',
    kind: 'BOUNCE' as const,
  };
  vi.spyOn(freezeApi, 'list').mockResolvedValue([]);
  vi.spyOn(freezeApi, 'listBounces').mockResolvedValue([made]);
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.bounces).toEqual([made]));
  act(() => hook.result.current.addBounceToMix(made.id));
  expect(hook.result.current.mix?.layers.at(-1)).toMatchObject({
    kind: 'RENDER',
    id: made.id,
  });
  const remove = vi
    .spyOn(freezeApi, 'deleteBounce')
    .mockRejectedValueOnce({ code: 'BOUNCE_IN_USE' });
  await act(async () => {
    await hook.result.current.deleteBounce(made.id);
  });
  expect(hook.result.current.error).toContain('저장된 믹스 설정');
  expect(hook.result.current.mix?.layers.some((l) => l.id === made.id)).toBe(
    true,
  );
  remove.mockResolvedValueOnce(true);
  vi.mocked(freezeApi.listBounces).mockResolvedValue([]);
  await act(async () => {
    await hook.result.current.deleteBounce(made.id);
  });
  expect(remove).toHaveBeenLastCalledWith(take.projectId, made.id);
  expect(hook.result.current.bounces).toEqual([]);
  expect(hook.result.current.mix?.layers).toEqual(mix.layers);
  expect(hook.result.current.notice).toContain('Bounce 파일을 지웠습니다');
  hook.unmount();
  main.dispose();
});
it('10분 테이크도 믹스 준비하고, 합계 512MiB를 넘으면 거부한다(docs/12 믹스 입력 한도 v2)', async () => {
  const { main, take, prepare, wrapper, props } = setup();
  vi.mocked(recordingApi.list).mockResolvedValue([
    { ...take, frames: 48000 * 600 },
  ]);
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  hook.unmount();
  main.dispose();
});
it('믹스 준비 입력 합계가 512MiB를 넘으면 읽기 전에 거부한다(docs/12 믹스 입력 한도 v2)', async () => {
  const { main, take, prepare, wrapper, props } = setup();
  vi.mocked(recordingApi.list).mockResolvedValue([
    { ...take, frames: (512 * 1024 * 1024) / 4 },
  ]);
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(prepare).not.toHaveBeenCalled();
  expect(recordingApi.read).not.toHaveBeenCalled();
  expect(hook.result.current.error).toContain('512MiB');
  hook.unmount();
  main.dispose();
});
it('출력 장치가 있으면 Rust로 준비하고 파일을 화면으로 읽지 않으며, 실패하면 기존 재생으로 준비한다(docs/12 네이티브 재생 v1)', async () => {
  const { main, mix, prepare, wrapper, props } = setup();
  const nativePrepare = vi
    .spyOn(nativePlaybackApi, 'prepare')
    .mockResolvedValue({ sampleRate: 48000, durationMs: 1000 });
  vi.spyOn(nativePlaybackApi, 'transport').mockResolvedValue({
    prepared: true,
    playing: false,
    positionMs: 0,
    loopCount: 0,
    errorCode: null,
  });
  const release = vi
    .spyOn(nativePlaybackApi, 'release')
    .mockResolvedValue(undefined);
  const hook = renderHook(
    (p) =>
      useProjectMix(
        p.projectId,
        p.backingId,
        p.revisionId,
        p.enabled,
        null,
        'fixture-output',
      ),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(nativePrepare).toHaveBeenCalledWith(
    'fixture-output',
    mix,
    props.backingId,
  );
  expect(recordingApi.read).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  expect(main.nativeAttached).toBe(true);
  expect(hook.result.current.prepared).toBe(true);
  expect(hook.result.current.nativeActive).toBe(true);
  // 끄면 떼고 Rust 쪽을 놓은 뒤, 다음 준비는 기존 재생으로 합니다.
  act(() => hook.result.current.setNativePlayback(false));
  expect(main.nativeAttached).toBe(false);
  expect(release).toHaveBeenCalled();
  expect(hook.result.current.prepared).toBe(false);
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(nativePrepare).toHaveBeenCalledTimes(1);
  expect(prepare).toHaveBeenCalledTimes(1);
  // 다시 켜고 Rust 준비가 실패(MP3 반주)하면 이유를 알리고 기존 재생으로 준비합니다.
  act(() => hook.result.current.setNativePlayback(true));
  nativePrepare.mockRejectedValueOnce({ code: 'MIX_FORMAT_UNSUPPORTED' });
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(main.nativeAttached).toBe(false);
  expect(hook.result.current.notice).toContain('MP3');
  hook.unmount();
  main.dispose();
  window.localStorage.removeItem('guitarlab.nativePlayback');
});
it('Rust 재생 중 AmpliTube 테이크를 고르면 기존 재생으로 다시 준비해 적용하고, Freeze 목록 실패는 숨기지 않는다(리뷰 R1-2·R1-7)', async () => {
  const { main, take, mix, prepare, wrapper, props } = setup();
  vi.spyOn(freezeApi, 'list').mockRejectedValue({ code: 'FREEZE_INVALID' });
  vi.spyOn(freezeApi, 'listBounces').mockResolvedValue([]);
  vi.spyOn(nativePlaybackApi, 'prepare').mockResolvedValue({
    sampleRate: 48000,
    durationMs: 1000,
  });
  vi.spyOn(nativePlaybackApi, 'transport').mockResolvedValue({
    prepared: true,
    playing: false,
    positionMs: 0,
    loopCount: 0,
    errorCode: null,
  });
  vi.spyOn(nativePlaybackApi, 'release').mockResolvedValue(undefined);
  const setWet = vi
    .spyOn(TakeMixPlayer.prototype, 'setWet')
    .mockResolvedValue(undefined);
  const hook = renderHook(
    (p) =>
      useProjectMix(
        p.projectId,
        p.backingId,
        p.revisionId,
        p.enabled,
        null,
        'fixture-output',
      ),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  expect(hook.result.current.notice).toContain('Freeze 목록을 읽지 못했습니다');
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(main.nativeAttached).toBe(true);
  expect(hook.result.current.notice).toContain('Freeze 목록을 읽지 못했습니다');
  await act(async () => {
    await hook.result.current.setWetTake(take.id);
  });
  expect(main.nativeAttached).toBe(false);
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(setWet).toHaveBeenCalledWith(take.id);
  hook.unmount();
  main.dispose();
});
it('Solo한 테이크를 Bounce하면 Solo를 Bounce 줄로 옮겨 결과가 들린다(리뷰 R2-6)', async () => {
  const { main, take, mix, wrapper, props } = setup();
  const soloed: MixDocument = {
    ...mix,
    layers: mix.layers.map((l) =>
      l.id === take.id ? { ...l, solo: true } : l,
    ),
  };
  vi.mocked(mixApi.load).mockResolvedValue(soloed);
  const made = {
    ...frozenFixture(take.projectId, take.id),
    id: '00000000-0000-4000-8000-000000000098',
    kind: 'BOUNCE' as const,
  };
  vi.spyOn(freezeApi, 'bounce').mockResolvedValue(made);
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(soloed));
  await act(async () => {
    await hook.result.current.bounceTake(take.id);
  });
  const layers = hook.result.current.mix?.layers ?? [];
  expect(layers.map((l) => [l.kind, l.mute, l.solo])).toEqual([
    ['LOCAL_ASSET', false, false],
    ['TAKE', true, false],
    ['RENDER', false, true],
  ]);
  hook.unmount();
  main.dispose();
});
it('Freeze 목록 실패와 Rust 준비 실패가 겹쳐도 DI 대체 안내를 남긴다(리뷰 R2-4)', async () => {
  const { main, mix, prepare, wrapper, props } = setup();
  vi.mocked(freezeApi.list).mockRejectedValue({ code: 'FREEZE_INVALID' });
  vi.spyOn(nativePlaybackApi, 'prepare').mockRejectedValue({
    code: 'FREEZE_INVALID',
  });
  const hook = renderHook(
    (p) =>
      useProjectMix(
        p.projectId,
        p.backingId,
        p.revisionId,
        p.enabled,
        null,
        'fixture-output',
      ),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(hook.result.current.notice).toContain('원본 DI로 재생');
  expect(hook.result.current.notice).toContain('Rust 재생을 쓰지 못해');
  hook.unmount();
  main.dispose();
});
it('다른 반주로 녹음한 테이크는 Rust 준비도 하지 않고 거부한다(리뷰 R4-1)', async () => {
  const { main, take, prepare, wrapper, props } = setup();
  vi.mocked(recordingApi.list).mockResolvedValue([
    {
      ...take,
      transport: take.transport && {
        ...take.transport,
        backingAssetId: '00000000-0000-4000-8000-0000000000ee',
      },
    },
  ]);
  const nativePrepare = vi.spyOn(nativePlaybackApi, 'prepare');
  const hook = renderHook(
    (p) =>
      useProjectMix(
        p.projectId,
        p.backingId,
        p.revisionId,
        p.enabled,
        null,
        'fixture-output',
      ),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.takes).toHaveLength(1));
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(nativePrepare).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  expect(hook.result.current.prepared).toBe(false);
  expect(hook.result.current.error).toBeTruthy();
  hook.unmount();
  main.dispose();
});
it('준비 중에는 Bounce를 믹스에 넣지 않아 준비한 구성과 화면이 어긋나지 않는다(리뷰 R5-2)', async () => {
  const { main, take, mix, wrapper, props } = setup();
  const made = {
    ...frozenFixture(take.projectId, take.id),
    id: '00000000-0000-4000-8000-000000000097',
    kind: 'BOUNCE' as const,
  };
  vi.mocked(freezeApi.listBounces).mockResolvedValue([made]);
  let finish: () => void = () => {};
  vi.spyOn(nativePlaybackApi, 'prepare').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ sampleRate: 48000, durationMs: 1000 });
      }),
  );
  vi.spyOn(nativePlaybackApi, 'transport').mockResolvedValue({
    prepared: true,
    playing: false,
    positionMs: 0,
    loopCount: 0,
    errorCode: null,
  });
  vi.spyOn(nativePlaybackApi, 'release').mockResolvedValue(undefined);
  const hook = renderHook(
    (p) =>
      useProjectMix(
        p.projectId,
        p.backingId,
        p.revisionId,
        p.enabled,
        null,
        'fixture-output',
      ),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.bounces).toEqual([made]));
  let preparing: Promise<void> | undefined;
  act(() => {
    preparing = hook.result.current.prepare();
  });
  act(() => hook.result.current.addBounceToMix(made.id));
  expect(hook.result.current.mix?.layers).toEqual(mix.layers);
  await act(async () => {
    finish();
    await preparing;
  });
  expect(hook.result.current.prepared).toBe(true);
  expect(hook.result.current.mix?.layers).toEqual(mix.layers);
  hook.unmount();
  main.dispose();
});
it('Rust 준비를 기다리는 동안 배속을 바꾸면 Rust를 붙이지 않고 기존 재생으로 준비한다', async () => {
  const { main, mix, prepare, wrapper, props } = setup();
  let finish: () => void = () => {};
  vi.spyOn(nativePlaybackApi, 'prepare').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ sampleRate: 48000, durationMs: 1000 });
      }),
  );
  const release = vi
    .spyOn(nativePlaybackApi, 'release')
    .mockResolvedValue(undefined);
  const hook = renderHook(
    (p) =>
      useProjectMix(
        p.projectId,
        p.backingId,
        p.revisionId,
        p.enabled,
        null,
        'fixture-output',
      ),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  let preparing: Promise<void> | undefined;
  act(() => {
    preparing = hook.result.current.prepare();
  });
  main.setRate(0.75);
  await act(async () => {
    finish();
    await preparing;
  });
  expect(main.nativeAttached).toBe(false);
  expect(release).toHaveBeenCalled();
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(hook.result.current.notice).toContain('1배속이 아님');
  hook.unmount();
  main.dispose();
});
it('Bounce 뒤 목록 재조회가 늦게 끝나도 바뀐 프로젝트의 목록을 덮지 않는다(리뷰 R7-2)', async () => {
  const { main, take, mix, wrapper, props } = setup();
  const made = {
    ...frozenFixture(take.projectId, take.id),
    id: '00000000-0000-4000-8000-000000000096',
    kind: 'BOUNCE' as const,
  };
  vi.spyOn(freezeApi, 'bounce').mockResolvedValue(made);
  let late: () => void = () => {};
  let calls = 0;
  vi.mocked(freezeApi.listBounces).mockImplementation(async (id) => {
    // 처음 조회(열 때)는 빈 목록, Bounce 뒤 A 재조회는 늦게 끝납니다.
    if (id === take.projectId && ++calls === 2)
      return new Promise((resolve) => {
        late = () => resolve([made]);
      });
    return [];
  });
  const hook = renderHook(
    (p) => useProjectMix(p.projectId, p.backingId, p.revisionId, p.enabled),
    { initialProps: props, wrapper },
  );
  await waitFor(() => expect(hook.result.current.mix).toEqual(mix));
  let bouncing: Promise<void> | undefined;
  act(() => {
    bouncing = hook.result.current.bounceTake(take.id);
  });
  await waitFor(() => expect(calls).toBe(2));
  const other = '00000000-0000-4000-8000-0000000000bb';
  vi.mocked(mixApi.load).mockResolvedValue({
    ...mix,
    projectId: other,
    layers: [],
  });
  vi.mocked(recordingApi.list).mockResolvedValue([]);
  hook.rerender({ ...props, projectId: other });
  await waitFor(() => expect(hook.result.current.mix?.projectId).toBe(other));
  await act(async () => {
    late();
    await bouncing;
  });
  expect(hook.result.current.bounces).toEqual([]);
  expect(hook.result.current.mix?.projectId).toBe(other);
  hook.unmount();
  main.dispose();
});
