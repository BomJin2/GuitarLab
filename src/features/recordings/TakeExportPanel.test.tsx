import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { recordingFixture } from '../../test/recordingFixture';
import { takeExportApi } from './takeExport';
import { TakeExportPanel } from './TakeExportPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('명시적 선택만 출력하고 중복 시작을 막으며 실제 완료 뒤 안내한다', async () => {
  vi.spyOn(takeExportApi, 'available').mockReturnValue(true);
  let finish!: (result: { bytes: number; sha256: string }) => void;
  const exportTake = vi.spyOn(takeExportApi, 'export').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<TakeExportPanel take={recordingFixture()} />);
  expect(exportTake).not.toHaveBeenCalled();
  const button = screen.getByRole('button', {
    name: '원본 WAV를 새 파일로 내보내기',
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(exportTake).toHaveBeenCalledTimes(1);
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText(/저장했습니다/)).toBeNull();
  await act(async () => finish({ bytes: 768058, sha256: 'a'.repeat(64) }));
  expect(screen.getByText(/원본과 동일한 새 WAV로 768,058바이트/)).toBeTruthy();
});
it('취소·이탈은 신호를 전달하고 늦은 완료를 새 테이크에 표시하지 않는다', async () => {
  vi.spyOn(takeExportApi, 'available').mockReturnValue(true);
  let signal: AbortSignal | undefined;
  let finish!: (result: { bytes: number; sha256: string }) => void;
  vi.spyOn(takeExportApi, 'export').mockImplementation((_take, current) => {
    signal = current;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const view = render(
    <TakeExportPanel key="first" take={recordingFixture()} />,
  );
  fireEvent.click(screen.getByText('원본 WAV를 새 파일로 내보내기'));
  fireEvent.click(screen.getByText('내보내기 취소'));
  expect(signal?.aborted).toBe(true);
  expect(screen.getByText(/취소 정리 중/)).toBeTruthy();
  view.rerender(
    <TakeExportPanel
      key="second"
      take={recordingFixture({ id: recordingFixture().projectId })}
    />,
  );
  await act(async () => finish({ bytes: 768058, sha256: 'a'.repeat(64) }));
  expect(screen.queryByText(/저장했습니다/)).toBeNull();
});
it('오류·READY 복구본의 누락 안내와 브라우저 제한을 표시한다', async () => {
  vi.spyOn(takeExportApi, 'available').mockReturnValue(true);
  vi.spyOn(takeExportApi, 'export').mockRejectedValue(
    new Error('EXPORT_DESTINATION_EXISTS'),
  );
  render(
    <TakeExportPanel
      take={recordingFixture({ recoveredFrom: recordingFixture().projectId })}
    />,
  );
  expect(screen.getByText(/잃은 구간이 복원되지 않습니다/)).toBeTruthy();
  await act(async () =>
    fireEvent.click(screen.getByText('원본 WAV를 새 파일로 내보내기')),
  );
  expect(screen.getByText(/새 WAV 파일명을 선택하세요/)).toBeTruthy();
  cleanup();
  vi.mocked(takeExportApi.available).mockReturnValue(false);
  render(<TakeExportPanel take={recordingFixture()} />);
  expect(screen.getByText('Windows 앱에서 사용할 수 있습니다.')).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: '원본 WAV를 새 파일로 내보내기' })
      .hasAttribute('disabled'),
  ).toBe(true);
});
