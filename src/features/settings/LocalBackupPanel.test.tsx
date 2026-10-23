import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { localBackupApi } from './localBackup';
import { LocalBackupPanel } from './LocalBackupPanel';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => undefined),
}));
vi.mock('./localBackup', async (original) => ({
  ...(await original<typeof import('./localBackup')>()),
  localBackupApi: {
    available: () => true,
    create: vi.fn(),
    verify: vi.fn(),
    preview: vi.fn(),
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('새 폴더 추출은 별도 동의를 요구하고 실제 앱 데이터 복원으로 표시하지 않는다', async () => {
  vi.mocked(localBackupApi.preview).mockResolvedValue({
    schemaVersion: 1,
    state: 'RESTORED_TO_NEW_FOLDER',
    files: 3,
    bytes: 1024,
    externalReferencesNotCopied: 2,
    restoreSupported: false,
    appDataReplaced: false,
  });
  render(<LocalBackupPanel />);
  const preview = screen.getByRole('button', { name: '새 폴더 복원 미리보기' });
  fireEvent.click(preview);
  expect(localBackupApi.preview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(preview);
  await screen.findByText(/새 GuitarLab-backup-preview 폴더에 3개 파일/);
  expect(screen.getByText(/현재 앱 데이터는 바꾸지 않았습니다/)).toBeTruthy();
  expect(localBackupApi.create).not.toHaveBeenCalled();
});
it('백업 동의 없이 직접 선택한 ZIP만 검사하고 저장/복원 성공으로 표시하지 않는다', async () => {
  vi.mocked(localBackupApi.verify).mockResolvedValue({
    schemaVersion: 1,
    state: 'VERIFIED',
    files: 3,
    bytes: 1024,
    externalReferencesNotCopied: 0,
    restoreSupported: false,
  });
  render(<LocalBackupPanel />);
  fireEvent.click(screen.getByRole('button', { name: '백업 ZIP 검사' }));
  await screen.findByText(/선택한 백업 ZIP의 3개 파일 지문/);
  expect(localBackupApi.create).not.toHaveBeenCalled();
  expect(screen.queryByText(/새 ZIP에 3개 파일/)).toBeNull();
});
it('명시적으로 동의한 후에만 백업하고 완료/외부 참조 제외를 표시한다', async () => {
  vi.mocked(localBackupApi.create).mockResolvedValue({
    schemaVersion: 1,
    state: 'COMPLETED',
    files: 3,
    bytes: 1024,
    externalReferencesNotCopied: 2,
    restoreSupported: false,
  });
  render(<LocalBackupPanel />);
  const start = screen.getByRole('button', { name: '새 ZIP으로 백업' });
  expect(start.hasAttribute('disabled')).toBe(true);
  fireEvent.click(start);
  expect(localBackupApi.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(start);
  await screen.findByText(/새 ZIP에 3개 파일/);
  expect(screen.getByText(/외부 참조 음원 2개/)).toBeTruthy();
  expect(localBackupApi.create).toHaveBeenCalledTimes(1);
});
it('중복 백업을 막고 취소 요청 뒤 실제 종료까지 잠근다', async () => {
  let finish:
    | ((value: Awaited<ReturnType<typeof localBackupApi.create>>) => void)
    | undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(localBackupApi.create).mockImplementation((value) => {
    signal = value;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  render(<LocalBackupPanel />);
  fireEvent.click(screen.getByRole('checkbox'));
  const start = screen.getByRole('button', { name: '새 ZIP으로 백업' });
  fireEvent.click(start);
  fireEvent.click(start);
  fireEvent.click(screen.getByRole('button', { name: '백업 취소' }));
  expect(signal?.aborted).toBe(true);
  expect(start.hasAttribute('disabled')).toBe(true);
  expect(localBackupApi.create).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish?.({
      schemaVersion: 1,
      state: 'COMPLETED',
      files: 3,
      bytes: 100,
      externalReferencesNotCopied: 0,
      restoreSupported: false,
    });
  });
  expect(start.hasAttribute('disabled')).toBe(false);
  expect(screen.getByText(/이미 완성된 ZIP/)).toBeTruthy();
});
it('화면 이탈 시 취소하고 늦은 완료로 다른 화면을 갱신하지 않는다', async () => {
  let signal: AbortSignal | undefined;
  vi.mocked(localBackupApi.create).mockImplementation((value) => {
    signal = value;
    return new Promise(() => undefined);
  });
  const view = render(<LocalBackupPanel />);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '새 ZIP으로 백업' }));
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
