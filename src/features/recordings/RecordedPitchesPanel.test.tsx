import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RecordedPitchesPanel } from './RecordedPitchesPanel';
import { recordedPitchesApi, type RecordedPitches } from './recordedPitches';
import { recordedPitchTrackApi } from './recordedPitchTrack';
import {
  recordedPitchTrackFixture,
  recordedOscillationFixture,
} from '../../test/recordedPitchTrackFixture';
import { recordingFixture } from '../../test/recordingFixture';
import { recordedPitchesFixture } from '../../test/recordedPitchesFixture';

vi.mock('./recordedPitches', async (original) => ({
  ...(await original<typeof import('./recordedPitches')>()),
  recordedPitchesApi: { available: () => true, analyze: vi.fn() },
}));
vi.mock('./recordedPitchTrack', async (original) => ({
  ...(await original<typeof import('./recordedPitchTrack')>()),
  recordedPitchTrackApi: { available: () => true, analyze: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('주기적 변화의 속도와 깊이를 표시하되 주법 확인이나 점수로 표시하지 않는다', async () => {
  vi.mocked(recordedPitchTrackApi.analyze).mockResolvedValue(
    recordedOscillationFixture(),
  );
  render(<RecordedPitchesPanel take={recordingFixture()} />);
  fireEvent.change(screen.getByRole('combobox', { name: '분석 방식' }), {
    target: { value: 'TRACK' },
  });
  fireEvent.click(screen.getByRole('button', { name: '선택 구간 음정 분석' }));
  await screen.findByText(/주기적 음정 흔들림 후보/);
  expect(screen.getByText(/흔들림 속도 6.0Hz/).textContent).toContain(
    '80.0cents',
  );
  expect(
    screen.getByText(/비브라토 주법 확인이나 정답 확률이 아닙니다/),
  ).toBeTruthy();
});
it('명시적 분석 후 음 이름/상대 강도와 한계를 표시하며 입력 변경 때 결과를 비운다', async () => {
  vi.mocked(recordedPitchesApi.analyze).mockResolvedValue(
    recordedPitchesFixture(),
  );
  render(<RecordedPitchesPanel take={recordingFixture()} />);
  expect(recordedPitchesApi.analyze).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '선택 구간 음정 분석' }));
  await screen.findByText(/실험적 음정 후보/);
  expect(screen.getByText(/C4 ·/).textContent).toContain('상대 강도 1.000');
  expect(screen.getByText(/정답 신뢰도·확률이 아닙니다/)).toBeTruthy();
  fireEvent.change(screen.getByRole('spinbutton', { name: '분석 시작 ms' }), {
    target: { value: '2000' },
  });
  expect(screen.queryByText(/실험적 음정 후보/)).toBeNull();
  fireEvent.change(screen.getByRole('spinbutton', { name: '분석 시작 ms' }), {
    target: { value: '' },
  });
  expect(
    screen.getByRole('button', { name: '선택 구간 음정 분석' }),
  ).toHaveProperty('disabled', true);
});
it('취소 완료 전 잠금을 유지하고 늦은 성공이나 다른 테이크 결과를 표시하지 않는다', async () => {
  let done: ((value: RecordedPitches) => void) | undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(recordedPitchesApi.analyze).mockImplementationOnce((_, __, s) => {
    signal = s;
    return new Promise((resolve) => {
      done = resolve;
    });
  });
  const view = render(<RecordedPitchesPanel take={recordingFixture()} />);
  fireEvent.click(screen.getByRole('button', { name: '선택 구간 음정 분석' }));
  fireEvent.click(screen.getByRole('button', { name: '구간 분석 취소' }));
  expect(signal?.aborted).toBe(true);
  expect(
    screen.getByRole('button', { name: '선택 구간 음정 분석' }),
  ).toHaveProperty('disabled', true);
  await act(async () => done?.(recordedPitchesFixture()));
  expect(screen.queryByText(/실험적 음정 후보/)).toBeNull();
  vi.mocked(recordedPitchesApi.analyze).mockImplementationOnce((_, __, s) => {
    signal = s;
    return new Promise((resolve) => {
      done = resolve;
    });
  });
  fireEvent.click(screen.getByRole('button', { name: '선택 구간 음정 분석' }));
  view.rerender(
    <RecordedPitchesPanel
      take={recordingFixture({ id: '00000000-0000-4000-8000-000000000009' })}
    />,
  );
  expect(signal?.aborted).toBe(true);
  await act(async () => done?.(recordedPitchesFixture()));
  expect(screen.queryByText(/실험적 음정 후보/)).toBeNull();
});
it('네이티브 오류를 경로 없이 표시한다', async () => {
  vi.mocked(recordedPitchesApi.analyze).mockRejectedValue(
    new Error('WAV_INVALID'),
  );
  render(<RecordedPitchesPanel take={recordingFixture()} />);
  fireEvent.click(screen.getByRole('button', { name: '선택 구간 음정 분석' }));
  expect((await screen.findByRole('alert')).textContent).toContain('무결성');
});

it('단음 변화 선택은 자동 분석 없이 명시적으로 실행하고 전환 시 이전 결과를 지운다', async () => {
  vi.mocked(recordedPitchTrackApi.analyze).mockResolvedValue(
    recordedPitchTrackFixture(),
  );
  render(<RecordedPitchesPanel take={recordingFixture()} />);
  fireEvent.change(screen.getByRole('combobox', { name: '분석 방식' }), {
    target: { value: 'TRACK' },
  });
  expect(recordedPitchTrackApi.analyze).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '선택 구간 음정 분석' }));
  await screen.findByText(/음정 상승 후보/);
  expect(screen.getByText(/175.0cents/)).toBeTruthy();
  expect(
    screen.getByText(/벤딩·슬라이드·레가토를 구분하지 않습니다/),
  ).toBeTruthy();
  expect(recordedPitchesApi.analyze).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: '분석 방식' }), {
    target: { value: 'SPECTRAL' },
  });
  expect(screen.queryByText(/음정 상승 후보/)).toBeNull();
});
