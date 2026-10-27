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
  expect(hook.result.current.mix?.layers).toHaveLength(2);
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
        bytes: new ArrayBuffer(64 * 1024 * 1024),
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
  await waitFor(() => expect(hook.result.current.mix).toEqual(saved));
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
  expect(hook.result.current.mix?.layers.map((l) => l.id)).toEqual(
    info.stems.map((s) => s.id),
  );
  expect(hook.result.current.mix?.layers.every((l) => l.kind === 'STEM')).toBe(
    true,
  );
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
    layers: mix.layers.map((l) => ({ ...l, kind: 'STEM' })),
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
