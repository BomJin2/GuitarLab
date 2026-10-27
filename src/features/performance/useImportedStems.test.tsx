import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { importedStemsApi, type ImportedGuitarStem } from './importedStems';
import { useImportedStems } from './useImportedStems';
vi.mock('./importedStems', async (original) => ({
  ...(await original<typeof import('./importedStems')>()),
  importedStemsApi: {
    available: () => true,
    import: vi.fn(),
    list: vi.fn(),
    read: vi.fn(),
  },
}));
const projectId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const stem: ImportedGuitarStem = {
  schemaVersion: 1,
  id,
  projectId,
  name: '자체 음원.wav',
  role: 'LEAD',
  origin: 'USER_IMPORTED',
  sampleRate: 48000,
  channels: 1,
  frames: 2,
  durationMs: (2 * 1000) / 48000,
  bytes: 52,
  sha256: 'a'.repeat(64),
  peak: 0.5,
  createdAtMs: 1,
};
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:local-stem'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  for (const [name, descriptor] of [
    ['createObjectURL', originalCreate],
    ['revokeObjectURL', originalRevoke],
  ] as const) {
    if (descriptor) Object.defineProperty(URL, name, descriptor);
    else Reflect.deleteProperty(URL, name);
  }
});
it('명시적으로 선택/목록·청취하고 잠금·unmount에서 URL을 해제한다', async () => {
  vi.mocked(importedStemsApi.import).mockResolvedValue(stem);
  vi.mocked(importedStemsApi.list).mockResolvedValue([stem]);
  vi.mocked(importedStemsApi.read).mockResolvedValue({
    stem,
    bytes: new ArrayBuffer(52),
  });
  const hook = renderHook(
    (locked: boolean) => useImportedStems(projectId, locked),
    { initialProps: false },
  );
  expect(importedStemsApi.list).not.toHaveBeenCalled();
  act(() => hook.result.current.changeRole('LEAD'));
  await act(async () => {
    await hook.result.current.import();
  });
  expect(hook.result.current.items).toEqual([stem]);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  await act(async () => {
    await hook.result.current.read(id);
  });
  expect(hook.result.current.preview?.url).toBe('blob:local-stem');
  hook.rerender(true);
  expect(hook.result.current.preview).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-stem');
  hook.rerender(false);
  await act(async () => {
    await hook.result.current.read(id);
  });
  hook.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it('취소/프로젝트 전환/잠금/이탈은 native 완료까지 기다리고 늦은 항목·개인 오류를 버린다', async () => {
  let finish: (value: ImportedGuitarStem) => void = () => undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(importedStemsApi.import).mockImplementation(
    (_project, _role, current) => {
      signal = current;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  const hook = renderHook(
    (props: { id: string; locked: boolean }) =>
      useImportedStems(props.id, props.locked),
    { initialProps: { id: projectId, locked: false } },
  );
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.import();
  });
  act(() => hook.result.current.cancel());
  expect(signal?.aborted).toBe(true);
  expect(hook.result.current.busy).toBe(true);
  await act(async () => {
    await hook.result.current.import();
    finish(stem);
    await pending;
  });
  expect(importedStemsApi.import).toHaveBeenCalledOnce();
  expect(hook.result.current.items).toEqual([]);
  for (const change of [
    { id, locked: false },
    { id: projectId, locked: true },
  ]) {
    hook.rerender({ id: projectId, locked: false });
    act(() => {
      pending = hook.result.current.import();
    });
    hook.rerender(change);
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish(stem);
      await pending;
    });
    expect(hook.result.current.items).toEqual([]);
  }
  hook.rerender({ id: projectId, locked: false });
  vi.mocked(importedStemsApi.list).mockRejectedValue(
    new Error('개인 파일 경로'),
  );
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.error).not.toContain('개인 파일 경로');
  act(() => {
    pending = hook.result.current.import();
  });
  hook.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish(stem);
    await pending;
  });
});

it('프로젝트 전환의 첫 반환부터 이전 목록과 역할을 숨긴다', async () => {
  vi.mocked(importedStemsApi.list).mockResolvedValue([stem]);
  const observations: ReturnType<typeof useImportedStems>[] = [];
  const { result, rerender } = renderHook(
    (value: string) => {
      const state = useImportedStems(value, false);
      observations.push(state);
      return state;
    },
    { initialProps: projectId },
  );
  act(() => result.current.changeRole('LEAD'));
  await act(async () => result.current.refresh());
  expect(result.current.items).toHaveLength(1);
  observations.length = 0;
  rerender(id);
  expect(observations.length).toBeGreaterThan(0);
  expect(
    observations.every(
      (value) => value.items.length === 0 && value.role === 'UNKNOWN',
    ),
  ).toBe(true);
});

it('이전 명령과 잠금 전에 보관한 함수가 새 조회나 잠금을 우회하지 않는다', async () => {
  const { result, rerender, unmount } = renderHook(
    (value: { id: string; locked: boolean }) =>
      useImportedStems(value.id, value.locked),
    { initialProps: { id: projectId, locked: false } },
  );
  const old = result.current;
  rerender({ id, locked: false });
  await act(async () => {
    await old.import();
    await old.refresh();
    await old.read(id);
    old.changeRole('LEAD');
  });
  expect(result.current.role).toBe('UNKNOWN');
  const beforeLock = result.current;
  rerender({ id, locked: true });
  await act(async () => {
    await beforeLock.import();
    await beforeLock.refresh();
    await beforeLock.read(id);
  });
  rerender({ id, locked: false });
  const last = result.current;
  unmount();
  await act(async () => {
    await last.import();
    await last.refresh();
    await last.read(id);
  });
  expect(importedStemsApi.import).not.toHaveBeenCalled();
  expect(importedStemsApi.list).not.toHaveBeenCalled();
  expect(importedStemsApi.read).not.toHaveBeenCalled();
});

it('이전 취소 명령은 새 프로젝트의 목록 조회를 취소하지 않는다', async () => {
  let finish!: (value: ImportedGuitarStem[]) => void;
  vi.mocked(importedStemsApi.list).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    (value: string) => useImportedStems(value, false),
    { initialProps: projectId },
  );
  const oldCancel = result.current.cancel;
  rerender(id);
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.refresh();
  });
  act(oldCancel);
  const aborted = vi.mocked(importedStemsApi.list).mock.calls[0]?.[1].aborted;
  await act(async () => {
    finish([{ ...stem, projectId: id }]);
    await pending;
  });
  expect(aborted).toBe(false);
  expect(result.current.items[0]?.projectId).toBe(id);
});
