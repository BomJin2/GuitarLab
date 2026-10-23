import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { listen } from '@tauri-apps/api/event';
import { ModelSetupPanel } from './ModelSetupPanel';
import { modelSetupApi, type ModelSetupResult } from './modelSetup';
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock('./modelSetup', async (original) => ({
  ...(await original<typeof import('./modelSetup')>()),
  modelSetupApi: { available: () => true, install: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const info: ModelSetupResult = {
  schemaVersion: 1,
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  environmentId: '12345678-1234-4234-8234-123456789012',
  state: 'INSTALLED',
  selfTest: 'OWNED_8_NOTES_PASSED',
};
const start = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Basic Pitch 설치 / 재검증' }),
  );
it('모델 전환은 이전 결과를 지우며 Demucs의 실제 분리 검증 결과를 구분한다', async () => {
  vi.mocked(modelSetupApi.install)
    .mockResolvedValueOnce(info)
    .mockResolvedValueOnce({
      ...info,
      modelId: 'htdemucs_6s',
      modelVersion: '4.1.0',
      selfTest: 'OWNED_STEM_SPLIT_PASSED',
    });
  render(<ModelSetupPanel />);
  start();
  await screen.findByText(/자체 8음 분석 통과/);
  fireEvent.change(screen.getByLabelText('설치할 AI 모델'), {
    target: { value: 'htdemucs_6s' },
  });
  expect(screen.queryByText(/자체 8음 분석 통과/)).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Demucs 전체 기타 설치 / 재검증' }),
  );
  await screen.findByText(/자체 4초 기타·반주 분리 통과/);
  expect(modelSetupApi.install).toHaveBeenLastCalledWith(
    expect.any(AbortSignal),
    expect.any(Function),
    'htdemucs_6s',
  );
  expect(screen.getByText(/가중치 연구용 안내/)).toBeTruthy();
});
it('취소 후 정리 오류를 표시하고 이미 활성화된 성공 응답은 보존한다', async () => {
  let rejectWork: (cause: Error) => void = () => undefined;
  vi.mocked(modelSetupApi.install).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectWork = reject;
      }),
  );
  render(<ModelSetupPanel />);
  start();
  fireEvent.click(screen.getByRole('button', { name: '설치 취소' }));
  await act(async () => rejectWork(new Error('AI_SETUP_CLEANUP_FAILED')));
  await screen.findByRole('alert');
  expect(
    screen.getByText(/새 임시 환경 정리를 확인하지 못했습니다/),
  ).toBeTruthy();
  vi.mocked(modelSetupApi.install).mockImplementationOnce(async (signal) => {
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true }),
    );
    return info;
  });
  start();
  fireEvent.click(screen.getByRole('button', { name: '설치 취소' }));
  await screen.findByText(/설치·활성화 완료/);
  expect(screen.queryByText(/설치 취소와/)).toBeNull();
});
it('명시적 버튼 전 설치하지 않으며 성공과 기존 환경 재검증을 구분한다', async () => {
  vi.mocked(modelSetupApi.install)
    .mockResolvedValueOnce(info)
    .mockResolvedValueOnce({ ...info, state: 'ALREADY_ACTIVE' });
  render(<ModelSetupPanel />);
  expect(modelSetupApi.install).not.toHaveBeenCalled();
  start();
  await screen.findByText(/설치·활성화 완료/);
  start();
  await screen.findByText(/기존 설치 재검증 완료/);
  expect(listen).toHaveBeenCalledWith(
    'ai-installation-close-blocked',
    expect.any(Function),
  );
});
it('진행·중복 클릭·취소·늦은 성공·실패·화면 이탈을 처리한다', async () => {
  let finish: (error: Error) => void = () => undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(modelSetupApi.install).mockImplementation((current, progress) => {
    signal = current;
    progress('자체 8음 분석 검증');
    return new Promise((_resolve, reject) => {
      finish = reject;
    });
  });
  const view = render(<ModelSetupPanel />);
  start();
  start();
  expect(modelSetupApi.install).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/자체 8음 분석 검증/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '설치 취소' }));
  expect(
    screen.getByRole('button', { name: 'Basic Pitch 설치 / 재검증' }),
  ).toHaveProperty('disabled', true);
  await act(async () => finish(new DOMException('취소', 'AbortError')));
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByText(/설치·활성화 완료/)).toBeNull();
  expect(screen.getByText(/새 임시 환경을 정리했습니다/)).toBeTruthy();
  vi.mocked(modelSetupApi.install).mockRejectedValueOnce(
    new Error('AI_SETUP_SELF_TEST_FAILED'),
  );
  start();
  await screen.findByRole('alert');
  expect(screen.getByText(/새 환경을 활성화하지 않았습니다/)).toBeTruthy();
  start();
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
