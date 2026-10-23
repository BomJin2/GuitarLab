import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ImportedStemsPanel } from './ImportedStemsPanel';
const state = vi.hoisted(() => ({
  role: 'UNKNOWN',
  items: [],
  preview: null as { stem: { name: string; peak: number }; url: string } | null,
  busy: false,
  error: null,
  notice: null,
  job: null,
  available: true,
  changeRole: vi.fn(),
  import: vi.fn(),
  refresh: vi.fn(),
  read: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
}));
vi.mock('./useImportedStems', () => ({ useImportedStems: () => state }));
vi.mock('../player/usePlayer', () => ({
  usePlayerEngine: () => ({ pause: state.pause }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.preview = null;
});
afterEach(() => vi.restoreAllMocks());
it('자동 파일 접근·AI 분리 주장을 하지 않고 명시적 조작과 재생 종료를 전달한다', () => {
  const pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => undefined);
  const load = vi
    .spyOn(HTMLMediaElement.prototype, 'load')
    .mockImplementation(() => undefined);
  const view = render(
    <ImportedStemsPanel projectId="project" locked={false} />,
  );
  expect(state.import).not.toHaveBeenCalled();
  expect(screen.getByText(/AI 자동 분리가 아닙니다/)).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: '파일의 기타 역할' }), {
    target: { value: 'LEAD' },
  });
  expect(state.changeRole).toHaveBeenCalledWith('LEAD');
  fireEvent.click(screen.getByRole('button', { name: '기타 WAV 선택·보존' }));
  expect(state.import).toHaveBeenCalledOnce();
  state.preview = { stem: { name: '자체.wav', peak: 0.5 }, url: 'blob:first' };
  view.rerender(<ImportedStemsPanel projectId="project" locked={false} />);
  const first = screen.getByLabelText('선택한 사용자 기타 파일');
  expect(first.getAttribute('src')).toBe('blob:first');
  state.preview = { ...state.preview, url: 'blob:second' };
  view.rerender(<ImportedStemsPanel projectId="project" locked={false} />);
  expect(pause).toHaveBeenCalledOnce();
  expect(first.getAttribute('src')).toBeNull();
  expect(
    screen.getByLabelText('선택한 사용자 기타 파일').getAttribute('src'),
  ).toBe('blob:second');
  view.unmount();
  expect(pause).toHaveBeenCalledTimes(2);
  expect(load).toHaveBeenCalledTimes(2);
});
