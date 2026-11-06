import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { DawTimeline } from './DawTimeline';
import { decodePeaks, peaksOf } from './dawWaveform';
import type { DawTrack } from './useDawTracks';

vi.mock('./dawWaveform', async (original) => ({
  ...(await original<typeof import('./dawWaveform')>()),
  decodePeaks: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('구간 최대 절댓값을 모든 채널에서 모아 늘리지 않고 실제 크기로 둔다', () => {
  expect(
    peaksOf(
      [
        new Float32Array([0.5, -0.25, 0.125, 0]),
        new Float32Array([0, 0, -0.75, 2]),
      ],
      2,
    ),
  ).toEqual([0.5, 1]);
  // 거의 무음인 테이크는 꽉 찬 파형이 아니라 거의 0으로 남습니다.
  expect(peaksOf([new Float32Array([0, 0.0000152587890625])], 1)).toEqual([
    0.0000152587890625,
  ]);
  expect(peaksOf([new Float32Array(3)], 8)).toEqual([0, 0, 0]);
  expect(peaksOf([], 8)).toEqual([]);
});

function loaded(
  locked = false,
  anchors = [
    { scoreTick: 0, audioTimeMs: 0 },
    { scoreTick: 3840, audioTimeMs: 4000 },
  ],
  tracks: DawTrack[] = [],
) {
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:daw',
    revokeObjectURL: vi.fn(),
  });
  const engine = new PlayerEngine();
  engine.load(new File(['x'], 'reference.mp3'));
  Object.defineProperty(engine.audio, 'duration', {
    value: 10,
    configurable: true,
  });
  engine.audio.dispatchEvent(new Event('loadedmetadata'));
  render(
    <Context.Provider value={engine}>
      <DawTimeline locked={locked} anchors={anchors} tracks={tracks} />
    </Context.Provider>,
  );
  return engine;
}

function clickAt(element: HTMLElement, x: number) {
  element.getBoundingClientRect = () => ({ left: 100, width: 200 }) as DOMRect;
  fireEvent.click(element, { clientX: x });
}

it('음원이 없으면 안내만 보여 준다', () => {
  render(
    <Context.Provider value={new PlayerEngine()}>
      <DawTimeline locked={false} anchors={null} />
    </Context.Provider>,
  );
  expect(
    screen.getByText('원곡 음원을 불러오면 파형과 싱크를 표시합니다'),
  ).toBeTruthy();
});

it('불러온 음원의 이름·파형·싱크 깃발을 그리고 누른 위치로 이동한다', async () => {
  vi.mocked(decodePeaks).mockResolvedValue({
    peaks: [0.2, 1, 0.5],
    durationMs: 10000,
  });
  const engine = loaded();
  expect(screen.getByText('reference.mp3')).toBeTruthy();
  expect(screen.getByText('파형을 준비하는 중입니다')).toBeTruthy();
  expect(decodePeaks).toHaveBeenCalledWith(engine.source);
  await act(async () => {});
  expect(document.querySelector('.daw-wave path')?.getAttribute('d')).toBe(
    'M0.5 -0.2V0.2M1.5 -1V1M2.5 -0.5V0.5',
  );
  expect(screen.getByText('⚑ 싱크 2').getAttribute('style')).toContain(
    'left: 40%',
  );
  clickAt(screen.getByTestId('daw-clip'), 150);
  expect(engine.getSnapshot().audioTimeMs).toBe(2500);
  clickAt(screen.getByTestId('daw-ruler'), 400);
  expect(engine.getSnapshot().audioTimeMs).toBe(10000);
});

it('디코딩 실패는 재생 안내로 바꾸고, 잠금 중에는 이동하지 않는다', async () => {
  vi.mocked(decodePeaks).mockRejectedValue(new Error('bad'));
  const engine = loaded(true);
  await act(async () => {});
  expect(
    screen.getByText('파형을 그릴 수 없습니다. 재생은 그대로 됩니다'),
  ).toBeTruthy();
  clickAt(screen.getByTestId('daw-clip'), 150);
  expect(engine.getSnapshot().audioTimeMs).toBe(0);
});

it('끝 쪽 깃발은 왼쪽으로 펼치고, 음원 뒤 앵커는 끝에 붙여 표시한다', () => {
  vi.mocked(decodePeaks).mockResolvedValue({ peaks: [], durationMs: 0 });
  loaded(false, [
    { scoreTick: 0, audioTimeMs: 0 },
    { scoreTick: 3840, audioTimeMs: 10000 },
    { scoreTick: 7680, audioTimeMs: 12000 },
  ]);
  expect(screen.getByText('⚑ 싱크 1').className).toBe('daw-flag');
  const end = screen.getByText('⚑ 싱크 2');
  expect(end.className).toBe('daw-flag daw-flag-end');
  expect(end.getAttribute('style')).toContain('left: 100%');
  const late = screen.getByText('⚑ 싱크 3 ▸ 음원 뒤');
  expect(late.className).toBe('daw-flag daw-flag-end');
  expect(late.getAttribute('style')).toContain('left: 100%');
});

it('믹스 레이어 줄을 시작·길이에 맞춰 그리고 상태 안내를 보여 준다', async () => {
  vi.mocked(decodePeaks).mockResolvedValue({ peaks: [1], durationMs: 10000 });
  const track = (key: string, patch: Partial<DawTrack>): DawTrack => ({
    key,
    name: key,
    silent: null,
    startMs: 0,
    lengthMs: null,
    peaks: undefined,
    ...patch,
  });
  const engine = loaded(
    false,
    [],
    [
      track('테이크', {
        startMs: 2000,
        lengthMs: 4000,
        peaks: [0.5],
        silent: '음소거',
      }),
      track('위치 없음', { startMs: null, lengthMs: 1000 }),
      track('큰 파일', { peaks: 'SKIPPED' }),
      track('앞쪽 잘림', { startMs: -2000, lengthMs: 4000, peaks: [0.5, 1] }),
    ],
  );
  await act(async () => {});
  expect(screen.getByText('트랙 (5)')).toBeTruthy();
  expect(screen.getByText('음소거')).toBeTruthy();
  const take = screen.getByTestId('daw-track-2').querySelector('.daw-region');
  expect(take?.getAttribute('style')).toContain('left: 20%');
  expect(take?.getAttribute('style')).toContain('width: 40%');
  expect(screen.getByText('곡 위치 없음')).toBeTruthy();
  expect(screen.getByText('용량 제한으로 파형 생략')).toBeTruthy();
  // 0초 앞 절반은 잘라 내고 보이는 절반만 그립니다.
  const cut = screen.getByTestId('daw-track-5');
  expect(cut.querySelector('.daw-region')?.getAttribute('style')).toContain(
    'width: 20%',
  );
  expect(cut.querySelector('svg')?.getAttribute('viewBox')).toBe('1 -1 1 2');
  clickAt(cut, 150);
  expect(engine.getSnapshot().audioTimeMs).toBe(2500);
});
