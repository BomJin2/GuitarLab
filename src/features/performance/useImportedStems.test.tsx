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
