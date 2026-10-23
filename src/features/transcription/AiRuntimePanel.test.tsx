import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AiRuntimePanel } from './AiRuntimePanel';
import { aiRuntimeApi, type AiRuntime } from './runtime';
vi.mock('./runtime', async (original) => ({
  ...(await original<typeof import('./runtime')>()),
  aiRuntimeApi: { available: () => true, inspect: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const fixture: AiRuntime = {
  schemaVersion: 1,
  pythonVersion: '3.10.8',
  models: [
    {
      id: 'basic-pitch',
      packageVersion: null,
      state: 'PACKAGE_MISSING',
      usable: false,
    },
    {
      id: 'audio-separator',
      packageVersion: null,
      state: 'PACKAGE_MISSING',
      usable: false,
    },
  ],
};
it('버튼 전에는 호출하지 않고 취소/늦은 응답을 성공 표시하지 않으며 재시도한다', async () => {
  let finish: (value: AiRuntime) => void = () => undefined;
  vi.mocked(aiRuntimeApi.inspect).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<AiRuntimePanel />);
  expect(aiRuntimeApi.inspect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'AI 환경 확인' }));
  fireEvent.click(screen.getByRole('button', { name: '환경 확인 취소' }));
  await act(async () => finish(fixture));
  expect(screen.queryByText(/로컬 worker 연결됨/)).toBeNull();
  expect(screen.getByText('AI 환경 확인을 취소했습니다.')).toBeTruthy();
  vi.mocked(aiRuntimeApi.inspect).mockResolvedValue(fixture);
  fireEvent.click(screen.getByRole('button', { name: 'AI 환경 확인' }));
  await screen.findByText(/로컬 worker 연결됨/);
  expect(screen.getAllByText(/패키지 미설치/)).toHaveLength(2);
});
it('timeout 안내와 화면 이탈 취소는 다른 화면을 갱신하지 않는다', async () => {
  vi.mocked(aiRuntimeApi.inspect).mockRejectedValueOnce(
    new Error('AI_WORKER_TIMEOUT'),
  );
  const view = render(<AiRuntimePanel />);
  fireEvent.click(screen.getByRole('button', { name: 'AI 환경 확인' }));
  await screen.findByRole('alert');
  expect(screen.getByText(/시간이 초과/)).toBeTruthy();
  let signal: AbortSignal | undefined;
  vi.mocked(aiRuntimeApi.inspect).mockImplementationOnce((s) => {
    signal = s;
    return new Promise(() => undefined);
  });
  fireEvent.click(screen.getByRole('button', { name: 'AI 환경 확인' }));
  view.unmount();
  await waitFor(() => expect(signal?.aborted).toBe(true));
});
