import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { localDiagnosticsApi } from './localDiagnostics';
import { LocalDiagnosticsPanel } from './LocalDiagnosticsPanel';

vi.mock('./localDiagnostics', async (original) => ({
  ...(await original<typeof import('./localDiagnostics')>()),
  localDiagnosticsApi: { available: () => true, read: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('사용자가 읽기를 눌러야 고정 코드 기록을 조회한다', async () => {
  vi.mocked(localDiagnosticsApi.read).mockResolvedValue({
    schemaVersion: 1,
    persistenceAvailable: true,
    droppedEvents: 2,
    events: [{ unixMs: 1234, code: 'NATIVE_PANIC' }],
  });
  render(<LocalDiagnosticsPanel />);
  expect(localDiagnosticsApi.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '로컬 진단 읽기' }));
  await screen.findByText(/로컬 진단 저장 확인됨/);
  expect(screen.getByText(/네이티브 panic 감지 · NATIVE_PANIC/)).toBeTruthy();
});
it('읽기 오류 원문을 노출하지 않고 다른 기능 중단으로 표시하지 않는다', async () => {
  vi.mocked(localDiagnosticsApi.read).mockRejectedValue(
    new Error('PRIVATE_PANIC_PAYLOAD'),
  );
  render(<LocalDiagnosticsPanel />);
  fireEvent.click(screen.getByRole('button', { name: '로컬 진단 읽기' }));
  await screen.findByText(/앱의 다른 기능은 계속 사용할 수 있습니다/);
  expect(screen.queryByText(/PRIVATE_PANIC_PAYLOAD/)).toBeNull();
});
