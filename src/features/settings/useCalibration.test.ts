import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calibrationApi,
  emptyProfileDocument,
  type ProfileDocument,
} from './calibration';
import { useCalibration } from './useCalibration';

vi.mock('./calibration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./calibration')>();
  return { ...actual, calibrationApi: { list: vi.fn(), save: vi.fn() } };
});
afterEach(() => vi.clearAllMocks());
describe('보정 읽기/저장 상태', () => {
  it('읽기 실패 후 재시도하며 저장 충돌 시 기존 문서를 보존한다', async () => {
    vi.mocked(calibrationApi.list)
      .mockRejectedValueOnce({ code: 'STORAGE_ERROR' })
      .mockResolvedValueOnce({ ...emptyProfileDocument, revision: 2 });
    vi.mocked(calibrationApi.save).mockRejectedValueOnce({
      code: 'REVISION_CONFLICT',
    });
    const { result } = renderHook(() => useCalibration(true));
    await act(async () => {});
    expect(result.current.status).toBe('ERROR');
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.document.revision).toBe(2);
    await act(async () => {
      await result.current.save(30, 'HEADPHONES', 1);
    });
    expect(result.current.status).toBe('ERROR');
    expect(result.current.document.revision).toBe(2);
    expect(calibrationApi.save).toHaveBeenCalledWith(2, 30, 'HEADPHONES', 1);
  });
  it('저장 중 이중 요청을 막고 완료된 원자 저장을 성공으로 표시한다', async () => {
    let finish: (value: ProfileDocument) => void = () => {};
    const pending = new Promise<ProfileDocument>((resolve) => {
      finish = resolve;
    });
    vi.mocked(calibrationApi.list).mockResolvedValue(emptyProfileDocument);
    vi.mocked(calibrationApi.save).mockReturnValue(pending);
    const { result } = renderHook(() => useCalibration(true));
    await act(async () => {});
    let saved: Promise<void> | undefined;
    act(() => {
      saved = result.current.save(30, 'HEADPHONES', 1);
    });
    await act(async () => {
      await result.current.save(45, 'HEADPHONES', 1);
    });
    expect(calibrationApi.save).toHaveBeenCalledOnce();
    await act(async () => {
      finish({ ...emptyProfileDocument, revision: 1 });
      await saved;
    });
    expect(result.current.status).toBe('SAVED');
    expect(result.current.document.revision).toBe(1);
  });
  it('브라우저에서는 로컬 설정 명령을 호출하지 않는다', async () => {
    const { result } = renderHook(() => useCalibration(false));
    await act(async () => {
      await result.current.load();
      await result.current.save(30, 'HEADPHONES', 1);
    });
    expect(calibrationApi.list).not.toHaveBeenCalled();
    expect(calibrationApi.save).not.toHaveBeenCalled();
  });
});
