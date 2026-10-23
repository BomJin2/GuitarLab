import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StemSeparationPanel } from './StemSeparationPanel';
import { separationApi, type SeparationPreview } from './separation';
import {
  separationFixture,
  separationRequest,
} from '../../test/separationFixture';
import { projectFixture } from '../../test/projectFixture';

vi.mock('./separation', async (original) => ({
  ...(await original<typeof import('./separation')>()),
  separationApi: { available: () => true, analyze: vi.fn(), restore: vi.fn() },
}));
const project = {
  details: projectFixture(),
  audioAssetId: separationRequest.assetId,
  busy: false,
};
function result(): SeparationPreview {
  return {
    info: separationFixture(),
    audio: separationFixture().stems.map((stem) => ({
      role: stem.role,
      bytes: new ArrayBuffer(stem.bytes),
    })),
  };
}
beforeEach(() => {
  class PreviewURL extends URL {
    static createObjectURL = vi.fn();
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal('URL', PreviewURL);
});
it('저장 결과 조회는 재분석하지 않으며 빈 결과와 복원을 표시한다', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stored');
  vi.mocked(separationApi.restore)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(result());
  const view = render(<StemSeparationPanel project={project} />);
  expect(separationApi.restore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('저장된 분리 결과 불러오기'));
  await screen.findByText('현재 음원에 저장된 분리 결과가 없습니다.');
  expect(view.container.querySelectorAll('audio').length).toBe(0);
  fireEvent.click(screen.getByText('저장된 분리 결과 불러오기'));
  await screen.findByText('저장된 분리 결과를 불러왔습니다.');
  expect(view.container.querySelectorAll('audio').length).toBe(2);
  expect(separationApi.analyze).not.toHaveBeenCalled();
});
it('미지원 두 기타 분리 대신 사용자 파일과 잔여 반주를 안내하며 분석을 시작하지 않는다', () => {
  render(<StemSeparationPanel project={project} />);
  const fallback = screen.getByRole('complementary', {
    name: '리드·리듬 분리 지원 범위',
  });
  expect(fallback.textContent).toContain('리드·리듬 자동 분리: 미지원');
  expect(fallback.textContent).toContain('리드와 리듬을 함께 제거한 AI 추정');
  expect(
    screen.getByRole('link', { name: '연주에서 별도 기타 파일 불러오기' }),
  ).toHaveProperty('hash', '#/performance');
  expect(separationApi.analyze).not.toHaveBeenCalled();
  expect(separationApi.restore).not.toHaveBeenCalled();
  expect(screen.queryByText(/믹서 연결은 후속 작업/)).toBeNull();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it('명시적 실행 전에는 분석하지 않고 결과를 별도 두 플레이어로 표시하며 URL을 회수한다', async () => {
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:guitar')
    .mockReturnValueOnce('blob:backing');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.mocked(separationApi.analyze).mockResolvedValue(result());
  const before = JSON.stringify(project);
  const view = render(<StemSeparationPanel project={project} />);
  expect(separationApi.analyze).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('프로젝트 WAV에서 전체 기타 분리'));
  await screen.findByText(/AI 분리 미리보기/);
  expect(view.container.querySelectorAll('audio').length).toBe(2);
  expect(create).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector('audio')?.autoplay).toBe(false);
  expect(JSON.stringify(project)).toBe(before);
  view.unmount();
  expect(revoke).toHaveBeenCalledWith('blob:guitar');
  expect(revoke).toHaveBeenCalledWith('blob:backing');
});
it('프로젝트 변경·취소 뒤의 오래된 결과를 표시하지 않으며 모델 오류를 알린다', async () => {
  const create = vi.spyOn(URL, 'createObjectURL');
  let resolve: ((value: SeparationPreview) => void) | undefined;
  let captured: AbortSignal | undefined;
  vi.mocked(separationApi.analyze).mockImplementationOnce((_, signal) => {
    captured = signal;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const view = render(<StemSeparationPanel project={project} />);
  fireEvent.click(screen.getByText('프로젝트 WAV에서 전체 기타 분리'));
  fireEvent.click(screen.getByText('분리 취소'));
  expect(captured?.aborted).toBe(true);
  view.rerender(<StemSeparationPanel />);
  await act(async () => resolve?.(result()));
  expect(create).not.toHaveBeenCalled();
  expect(screen.queryByText(/AI 분리 미리보기/)).toBeNull();
  view.rerender(<StemSeparationPanel project={project} />);
  vi.mocked(separationApi.analyze).mockRejectedValueOnce(
    new Error('AI_MODEL_MISSING'),
  );
  fireEvent.click(screen.getByText('프로젝트 WAV에서 전체 기타 분리'));
  expect(await screen.findByRole('alert')).toBeTruthy();
});
