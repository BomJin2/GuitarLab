import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModelDownloadPanel } from './ModelDownloadPanel';
import { modelCacheApi, type ModelCacheInfo } from './modelCache';
vi.mock('./modelCache', async (original) => ({
  ...(await original<typeof import('./modelCache')>()),
  modelCacheApi: { available: () => true, download: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const info: ModelCacheInfo = {
  schemaVersion: 1,
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  state: 'CACHE_VERIFIED',
  artifactCount: 41,
  totalBytes: 144366287,
  reusedFiles: 0,
};
it('동의와 버튼 전에는 받지 않고 실제 작업 결과를 설치 완료와 구분한다', async () => {
  vi.mocked(modelCacheApi.download).mockResolvedValue(info);
  render(<ModelDownloadPanel />);
  const button = screen.getByRole('button', {
    name: 'Basic Pitch 파일 다운로드',
  });
  expect(button).toHaveProperty('disabled', true);
  expect(modelCacheApi.download).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(button);
  await screen.findByText(/다운로드 파일 확인됨/);
  expect(screen.getByText(/설치 상태는 별도로 확인합니다/)).toBeTruthy();
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  expect(button).toHaveProperty('disabled', true);
});
it('진행·취소/늦은 응답·화면 이탈을 처리하고 실패 후 재동의로 재시도한다', async () => {
  let finish: (value: ModelCacheInfo) => void = () => undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(modelCacheApi.download).mockImplementation(
    (_consent, current, progress) => {
      signal = current;
      progress(25);
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  const view = render(<ModelDownloadPanel />);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Basic Pitch 파일 다운로드' }),
  );
  expect(screen.getByText(/파일 수신·검증 25%/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '다운로드 취소' }));
  await act(async () => finish(info));
  expect(screen.queryByText(/다운로드 파일 확인됨/)).toBeNull();
  vi.mocked(modelCacheApi.download).mockRejectedValueOnce(
    new Error('AI_CACHE_INTEGRITY'),
  );
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Basic Pitch 파일 다운로드' }),
  );
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Basic Pitch 파일 다운로드' }),
  );
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it('모델 변경은 이전 동의·결과를 초기화하고 진행 중에는 선택을 잠근다', async () => {
  vi.mocked(modelCacheApi.download).mockResolvedValueOnce(info);
  render(<ModelDownloadPanel />);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Basic Pitch 파일 다운로드' }),
  );
  await screen.findByText(/다운로드 파일 확인됨/);
  fireEvent.click(screen.getByRole('checkbox'));
  const selector = screen.getByRole('combobox', { name: '다운로드할 AI 모델' });
  fireEvent.change(selector, { target: { value: 'htdemucs_6s' } });
  expect(screen.queryByText(/다운로드 파일 확인됨/)).toBeNull();
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  expect(screen.getByText(/고정33개 또는34개/)).toBeTruthy();
  expect(screen.getByText(/가중치 연구용 안내/)).toBeTruthy();
  const button = screen.getByRole('button', {
    name: 'Demucs 전체 기타 파일 다운로드',
  });
  expect(button).toHaveProperty('disabled', true);
  let finish: (value: ModelCacheInfo) => void = () => undefined;
  vi.mocked(modelCacheApi.download).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(button);
  expect(selector).toHaveProperty('disabled', true);
  expect(modelCacheApi.download).toHaveBeenLastCalledWith(
    true,
    expect.any(AbortSignal),
    expect.any(Function),
    'htdemucs_6s',
  );
  await act(async () =>
    finish({
      ...info,
      modelId: 'htdemucs_6s',
      modelVersion: '4.1.0',
      artifactCount: 34,
      totalBytes: 708033316,
      reusedFiles: 34,
    }),
  );
  expect(selector).toHaveProperty('disabled', false);
  expect(screen.getByText(/다운로드 파일 확인됨 · 34개/)).toBeTruthy();
});
