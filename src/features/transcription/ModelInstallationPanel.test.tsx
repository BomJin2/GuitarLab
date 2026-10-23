import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModelInstallationPanel } from './ModelInstallationPanel';
import {
  modelInstallationApi,
  type ModelInstallation,
} from './modelInstallation';
vi.mock('./modelInstallation', async (original) => ({
  ...(await original<typeof import('./modelInstallation')>()),
  modelInstallationApi: { available: () => true, verify: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const report: ModelInstallation = {
  schemaVersion: 1,
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  pythonVersion: '3.10.8',
  state: 'FILES_VERIFIED',
};
it('자동 작업 없이 명시적 검증 후 파일 배지만 표시하고 모델 변경·실패 시 이전 성공을 지운다', async () => {
  vi.mocked(modelInstallationApi.verify).mockResolvedValue(report);
  render(<ModelInstallationPanel />);
  expect(modelInstallationApi.verify).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '선택 모델 설치 확인' }));
  await screen.findByText(/설치 파일 확인됨/);
  fireEvent.change(screen.getByLabelText('확인할 AI 모델'), {
    target: { value: 'htdemucs_6s' },
  });
  expect(screen.queryByText(/설치 파일 확인됨/)).toBeNull();
  expect(screen.getByText(/가중치 연구용 안내/)).toBeTruthy();
  vi.mocked(modelInstallationApi.verify).mockRejectedValue(
    new Error('AI_MODEL_INTEGRITY'),
  );
  fireEvent.click(screen.getByRole('button', { name: '선택 모델 설치 확인' }));
  await screen.findByRole('alert');
  expect(screen.getByText(/크기·해시가 다릅니다/)).toBeTruthy();
  expect(modelInstallationApi.verify).toHaveBeenLastCalledWith(
    'htdemucs_6s',
    expect.any(AbortSignal),
  );
});
it('취소·화면 이탈 후 늦은 결과는 성공으로 표시하지 않는다', async () => {
  let finish: (value: ModelInstallation) => void = () => undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(modelInstallationApi.verify).mockImplementation((_id, current) => {
    signal = current;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const view = render(<ModelInstallationPanel />);
  fireEvent.click(screen.getByRole('button', { name: '선택 모델 설치 확인' }));
  fireEvent.click(screen.getByRole('button', { name: '모델 확인 취소' }));
  await act(async () => finish(report));
  expect(screen.queryByText(/설치 파일 확인됨/)).toBeNull();
  expect(screen.getByText('모델 설치 확인을 취소했습니다.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '선택 모델 설치 확인' }));
  view.unmount();
  await waitFor(() => expect(signal?.aborted).toBe(true));
});
