import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectFixture } from '../../test/projectFixture';
import {
  separationFixture,
  separationRequest,
} from '../../test/separationFixture';
import { separationApi, type SeparationPreview } from './separation';
import { useSeparation } from './useSeparation';

vi.mock('./separation', () => ({
  separationApi: { available: () => true, analyze: vi.fn(), restore: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  class PreviewURL extends URL {
    static createObjectURL = vi.fn(() => `blob:${crypto.randomUUID()}`);
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal('URL', PreviewURL);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function project() {
  return {
    details: projectFixture(),
    audioAssetId: separationRequest.assetId,
    busy: false,
  };
}
function preview(): SeparationPreview {
  const info = separationFixture();
  return {
    info,
    audio: info.stems.map((stem) => ({
      role: stem.role,
      bytes: new ArrayBuffer(stem.bytes),
    })),
  };
}

it('음원 전환의 첫 반환부터 이전 미리 듣기를 숨기고 URL을 회수한다', async () => {
  vi.mocked(separationApi.restore).mockResolvedValue(preview());
  const observations: ReturnType<typeof useSeparation>[] = [];
  const { result, rerender } = renderHook(
    (value) => {
      const state = useSeparation(value);
      observations.push(state);
      return state;
    },
    { initialProps: project() },
  );
  await act(async () => result.current.restore());
  const urls =
    result.current.preview?.sources.map((source) => source.url) ?? [];
  expect(urls).toHaveLength(2);
  observations.length = 0;
  rerender({ ...project(), audioAssetId: crypto.randomUUID() });
  expect(
    observations.every(
      (state) => state.preview === null && state.notice === null,
    ),
  ).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  for (const url of urls) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
});

it('같은 음원 재진입·화면 이탈 뒤의 이전 함수가 작업을 시작하지 않는다', async () => {
  vi.mocked(separationApi.analyze).mockResolvedValue(preview());
  vi.mocked(separationApi.restore).mockResolvedValue(preview());
  const initial = project();
  const { result, rerender, unmount } = renderHook(useSeparation, {
    initialProps: initial,
  });
  const old = result.current;
  rerender({ ...initial, audioAssetId: crypto.randomUUID() });
  rerender(initial);
  await act(async () => {
    await old.analyze();
    await old.restore();
  });
  expect(separationApi.analyze).not.toHaveBeenCalled();
  expect(separationApi.restore).not.toHaveBeenCalled();
  const last = result.current;
  unmount();
  await act(async () => {
    await last.analyze();
    await last.restore();
  });
  expect(separationApi.analyze).not.toHaveBeenCalled();
  expect(separationApi.restore).not.toHaveBeenCalled();
});

it('이전 화면의 취소가 새 분리 작업을 취소하지 않는다', async () => {
  let finish!: (value: SeparationPreview) => void;
  vi.mocked(separationApi.analyze).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const initial = project();
  const { result, rerender } = renderHook(useSeparation, {
    initialProps: initial,
  });
  const oldCancel = result.current.cancel;
  const assetId = crypto.randomUUID();
  rerender({ ...initial, audioAssetId: assetId });
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.analyze();
  });
  act(oldCancel);
  const aborted = vi.mocked(separationApi.analyze).mock.calls[0]?.[1].aborted;
  await act(async () => {
    const value = preview();
    finish({ ...value, info: { ...value.info, assetId } });
    await pending;
  });
  expect(aborted).toBe(false);
  expect(result.current.preview?.sources).toHaveLength(2);
});

it('현재 작업 취소는 유효하고 늦은 결과에 미리 듣기 URL을 만들지 않는다', async () => {
  let finish!: (value: SeparationPreview) => void;
  vi.mocked(separationApi.analyze).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(useSeparation, { initialProps: project() });
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.analyze();
  });
  act(() => result.current.cancel());
  expect(vi.mocked(separationApi.analyze).mock.calls[0]?.[1].aborted).toBe(
    true,
  );
  await act(async () => {
    finish(preview());
    await pending;
  });
  expect(result.current.busy).toBe(false);
  expect(result.current.notice).toContain('작업을 취소했습니다');
  expect(result.current.preview).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('URL 부분 생성 실패를 정리하고 현재 문맥에서 다시 조회할 수 있다', async () => {
  vi.mocked(separationApi.restore).mockResolvedValue(preview());
  vi.mocked(URL.createObjectURL)
    .mockReturnValueOnce('blob:partial')
    .mockImplementationOnce(() => {
      throw new Error('테스트 URL 생성 실패');
    });
  const { result } = renderHook(useSeparation, { initialProps: project() });
  await act(async () => result.current.restore());
  expect(result.current.preview).toBeNull();
  expect(result.current.error).toContain('준비하지 못했습니다');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:partial');
  await act(async () => result.current.restore());
  expect(result.current.error).toBeNull();
  expect(result.current.preview?.sources).toHaveLength(2);
});
