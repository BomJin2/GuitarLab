import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  cacheCleanupApi,
  type CacheCleared,
  type CacheUsage,
} from './cacheCleanup';
import { CacheCleanupPanel } from './CacheCleanupPanel';

const usage: CacheUsage = {
  schemaVersion: 1,
  state: 'CACHE_USAGE',
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  profile: 'CP312_DOWNLOADS',
  files: 3,
  bytes: 1024,
  revision: 'a'.repeat(64),
};
const cleared: CacheCleared = {
  schemaVersion: 1,
  state: 'CACHE_CLEARED',
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  profile: 'CP312_DOWNLOADS',
  removedFiles: 3,
  removedBytes: 1024,
  installedEnvironmentsChanged: false,
};
vi.mock('./cacheCleanup', async (original) => ({
  ...(await original<typeof import('./cacheCleanup')>()),
  cacheCleanupApi: { available: () => true, inspect: vi.fn(), clear: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('자동 조회/삭제하지 않고 최신 조회와 명시 동의 후에만 선택 캐시를 정리한다', async () => {
  vi.mocked(cacheCleanupApi.inspect).mockResolvedValue(usage);
  vi.mocked(cacheCleanupApi.clear).mockResolvedValue(cleared);
  render(<CacheCleanupPanel />);
  const remove = screen.getByRole('button', { name: '선택 캐시 정리' });
  fireEvent.click(remove);
  expect(cacheCleanupApi.clear).not.toHaveBeenCalled();
  expect(cacheCleanupApi.inspect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '캐시 현황 조회' }));
  await screen.findByText(/Basic Pitch · 3개/);
  expect(remove.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(remove);
  await screen.findByText(/다운로드 캐시 3개를 정리했습니다/);
  expect(cacheCleanupApi.clear).toHaveBeenCalledWith(
    usage,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(remove.hasAttribute('disabled')).toBe(true);
});
it('모델을 바꾸면 이전 조회와 동의로 다른 모델을 지우지 않는다', async () => {
  vi.mocked(cacheCleanupApi.inspect).mockResolvedValue(usage);
  render(<CacheCleanupPanel />);
  fireEvent.click(screen.getByRole('button', { name: '캐시 현황 조회' }));
  await screen.findByText(/Basic Pitch · 3개/);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'htdemucs_6s' },
  });
  expect(
    screen
      .getByRole('button', { name: '선택 캐시 정리' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.queryByText(/Basic Pitch · 3개/)).toBeNull();
});
it('취소 시 실제 종료까지 잠그고 부분 삭제 가능성과 재조회를 안내한다', async () => {
  let finish: ((value: CacheCleared) => void) | undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(cacheCleanupApi.inspect).mockResolvedValue(usage);
  vi.mocked(cacheCleanupApi.clear).mockImplementation((_, current) => {
    signal = current;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  render(<CacheCleanupPanel />);
  fireEvent.click(screen.getByRole('button', { name: '캐시 현황 조회' }));
  await screen.findByText(/Basic Pitch · 3개/);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '선택 캐시 정리' }));
  fireEvent.click(screen.getByRole('button', { name: '캐시 작업 취소' }));
  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(true);
  await act(async () => {
    finish?.(cleared);
  });
  await screen.findByText(/이미 지운 캐시는 복구하지 않으며/);
  expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false);
  expect(
    screen
      .getByRole('button', { name: '선택 캐시 정리' })
      .hasAttribute('disabled'),
  ).toBe(true);
});
