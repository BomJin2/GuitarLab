import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { decodeModelStatus, modelStatusApi } from './modelStatus';
import { ModelStatusNotice } from './ModelStatusNotice';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const ok = {
  schemaVersion: 1,
  models: [
    { id: 'basic-pitch', state: 'MISSING' },
    { id: 'htdemucs_6s', state: 'DAMAGED' },
  ],
};

it('고정 순서·두 필드·세 상태만 받아들인다', () => {
  expect(decodeModelStatus(ok)).toEqual({
    'basic-pitch': 'MISSING',
    htdemucs_6s: 'DAMAGED',
  });
  for (const bad of [
    { ...ok, schemaVersion: 2 },
    { ...ok, path: 'C:/x' },
    { ...ok, models: [...ok.models].reverse() },
    { ...ok, models: [{ id: 'basic-pitch', state: 'READY' }, ok.models[1]] },
    { ...ok, models: [{ ...ok.models[0], path: 'x' }, ok.models[1]] },
  ])
    expect(() => decodeModelStatus(bad)).toThrow('AI_PROTOCOL_INVALID');
});

it('미설치·손상은 환경 설정 링크로 알리고 설치됨·조회 실패는 표시하지 않는다', async () => {
  vi.spyOn(modelStatusApi, 'available').mockReturnValue(true);
  const get = vi
    .spyOn(modelStatusApi, 'get')
    .mockResolvedValue(decodeModelStatus(ok));
  const { unmount } = render(<ModelStatusNotice modelId="basic-pitch" />);
  await waitFor(() =>
    expect(
      screen
        .getByRole('link', { name: '환경 설정에서 설치' })
        .getAttribute('href'),
    ).toBe('#/settings'),
  );
  unmount();
  render(<ModelStatusNotice modelId="htdemucs_6s" />);
  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: '환경 설정에서 재검증' }),
    ).toBeTruthy(),
  );
  cleanup();
  get.mockResolvedValue({
    'basic-pitch': 'INSTALLED',
    htdemucs_6s: 'INSTALLED',
  });
  render(<ModelStatusNotice modelId="basic-pitch" />);
  await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole('status')).toBeNull();
  cleanup();
  get.mockRejectedValue(new Error('AI_PROTOCOL_INVALID'));
  render(<ModelStatusNotice modelId="basic-pitch" />);
  await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
  expect(screen.queryByRole('status')).toBeNull();
});
