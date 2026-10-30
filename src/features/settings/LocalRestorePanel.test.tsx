import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LocalRestorePanel } from './LocalRestorePanel';
import { localRestoreApi } from './localRestore';
vi.mock('./localRestore', async (importOriginal) => {
  const original = await importOriginal<typeof import('./localRestore')>();
  return {
    ...original,
    localRestoreApi: {
      available: vi.fn(() => true),
      status: vi.fn(),
      schedule: vi.fn(),
      cancel: vi.fn(),
    },
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(localRestoreApi.status).mockResolvedValue({
    schemaVersion: 1,
    state: 'IDLE',
  });
});
afterEach(cleanup);
it('현재 자료 교체 동의와 상태 조회 뒤에만 예약할 수 있다', async () => {
  render(<LocalRestorePanel />);
  const button = screen.getByRole('button', { name: '백업 ZIP으로 복원 예약' });
  expect(button.hasAttribute('disabled')).toBe(true);
  await waitFor(() => expect(localRestoreApi.status).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  expect(localRestoreApi.schedule).not.toHaveBeenCalled();
});
it('예약이 있으면 중복 예약 대신 해제 기능을 제공한다', async () => {
  vi.mocked(localRestoreApi.status).mockResolvedValue({
    schemaVersion: 1,
    state: 'SCHEDULED',
    recoveryId: '00000000-0000-4000-8000-000000000001',
    files: 2,
    bytes: 3,
    externalReferencesNotCopied: 1,
    databaseVersion: 10,
    restartRequired: true,
    errorCode: null,
  });
  render(<LocalRestorePanel />);
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: '복원 예약 해제' })
        .hasAttribute('disabled'),
    ).toBe(false),
  );
  expect(
    screen
      .getByRole('button', { name: '백업 ZIP으로 복원 예약' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.getByText(/다음 실행에서 적용/)).toBeTruthy();
});
