import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BottomMixer } from './BottomMixer';
import { layerLevels, wavPeak } from './mixLabels';
import type { ProjectMixController } from './useProjectMix';

const live = vi.hoisted(() => ({ peak: 0.42 as number | null, closed: 0 }));
vi.mock('./liveLevel', () => ({
  LiveLevel: class {
    read() {
      return live.peak;
    }
    close() {
      live.closed++;
    }
  },
}));
vi.mock('../daw/dawWaveform', () => ({
  decodePeaks: vi.fn(async () => ({ peaks: [0.25, 0.9], durationMs: 1000 })),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const backingId = '00000000-0000-4000-8000-000000000005';
const takeId = '00000000-0000-4000-8000-000000000001';
function controller(patch: Partial<ProjectMixController> = {}) {
  return {
    mix: {
      schemaVersion: 1,
      projectId: '00000000-0000-4000-8000-000000000002',
      masterGain: 0.7,
      layers: [
        {
          kind: 'LOCAL_ASSET',
          id: backingId,
          gain: 0.5,
          mute: true,
          solo: false,
          offsetMs: 0,
        },
        {
          kind: 'TAKE',
          id: takeId,
          gain: 0.7,
          mute: false,
          solo: false,
          offsetMs: 0,
        },
      ],
    },
    takes: [],
    stems: [],
    importedStems: [],
    stemPeaks: {},
    levelSources: () => [],
    busy: false,
    update: vi.fn(),
    ...patch,
  } as unknown as ProjectMixController;
}

it('레이어별 M·S·음량과 마스터를 같은 믹스 갱신으로 바꾼다', () => {
  vi.stubGlobal('innerWidth', 1440);
  vi.stubGlobal('innerHeight', 900);
  const c = controller();
  render(<BottomMixer controller={c} enabled locked={false} />);
  expect(screen.getByRole('button', { name: '믹서 접기' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '로컬 반주 음소거' }));
  expect(vi.mocked(c.update).mock.calls[0]?.[0].layers[0]?.mute).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '누락된 테이크 Solo' }));
  expect(vi.mocked(c.update).mock.calls[1]?.[0].layers[1]?.solo).toBe(true);
  fireEvent.change(
    screen.getByRole('slider', { name: '누락된 테이크 믹서 음량' }),
    {
      target: { value: '30' },
    },
  );
  expect(vi.mocked(c.update).mock.calls[2]?.[0].layers[1]?.gain).toBe(0.3);
  fireEvent.change(screen.getByRole('slider', { name: '믹서 마스터 음량' }), {
    target: { value: '40' },
  });
  expect(vi.mocked(c.update).mock.calls[3]?.[0].masterGain).toBe(0.4);
});

it('1100×680 이하에서는 접혀 시작하고, 카피 화면·녹음 중에는 조절을 막는다', () => {
  vi.stubGlobal('innerWidth', 1100);
  vi.stubGlobal('innerHeight', 900);
  const { rerender } = render(
    <BottomMixer controller={controller()} enabled={false} locked={false} />,
  );
  expect(screen.queryByRole('slider')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '믹서 펼치기' }));
  expect(
    screen.getByText('연습·연주 화면에서 조절할 수 있습니다.'),
  ).toBeTruthy();
  expect(
    screen
      .getByRole('slider', { name: '믹서 마스터 음량' })
      .matches(':disabled'),
  ).toBe(true);
  rerender(<BottomMixer controller={controller()} enabled locked />);
  expect(screen.getByText('녹음 중에는 조절할 수 없습니다.')).toBeTruthy();
  rerender(
    <BottomMixer
      controller={controller({ mix: null })}
      enabled
      locked={false}
    />,
  );
  expect(
    screen.getByText('프로젝트를 열면 믹스 트랙이 표시됩니다.'),
  ).toBeTruthy();
});

it('최대 레벨 추정은 peak × 실제 재생 음량이고, 모르는 레이어는 합계에서 뺀다', () => {
  const c = controller({
    takes: [{ id: takeId, peak: 0.8 }],
  } as unknown as Partial<ProjectMixController>);
  const mix = c.mix!;
  // 반주는 음소거라 0, 테이크는 0.8 × 0.7 × 마스터 0.7.
  const muted = layerLevels(mix, c, 0.9);
  expect(muted.levels[0]).toBe(0);
  expect(muted.levels[1]).toBeCloseTo(0.392);
  expect(muted.unknown).toBe(false);
  const unmuted = {
    ...mix,
    layers: mix.layers.map((l) => ({ ...l, mute: false })),
  };
  expect(layerLevels(unmuted, c, 0.9).total).toBeCloseTo(0.315 + 0.392);
  // Solo가 켜지면 다른 레이어는 0입니다.
  const solo = {
    ...unmuted,
    layers: unmuted.layers.map((l, i) => ({ ...l, solo: i === 1 })),
  };
  expect(layerLevels(solo, c, 0.9).total).toBeCloseTo(0.392);
  const unknown = layerLevels(unmuted, c, null);
  expect(unknown.levels[0]).toBeNull();
  expect(unknown.total).toBeCloseTo(0.392);
  expect(unknown.unknown).toBe(true);
});

it('반주 음원을 읽어 합계가 1을 넘으면 클리핑 가능 경고를 보여 준다', async () => {
  vi.stubGlobal('innerWidth', 1440);
  vi.stubGlobal('innerHeight', 900);
  const base = controller({
    takes: [{ id: takeId, peak: 1.2 }],
  } as unknown as Partial<ProjectMixController>);
  const c = {
    ...base,
    mix: {
      ...base.mix!,
      masterGain: 1,
      layers: base.mix!.layers.map((l) => ({ ...l, mute: false, gain: 1 })),
    },
  } as ProjectMixController;
  render(
    <BottomMixer
      controller={c}
      enabled
      locked={false}
      backing={new Blob(['x'])}
    />,
  );
  expect(screen.getByText('일부 음원 레벨 미확인')).toBeTruthy();
  // 반주 0.9 + 테이크 1.2 = 2.10
  expect((await screen.findByRole('status')).textContent).toContain(
    '클리핑 가능 · 최대 합계 추정 2.10',
  );
  expect(screen.queryByText('일부 음원 레벨 미확인')).toBeNull();
  expect(
    (
      screen.getByRole('meter', {
        name: '마스터 최대 레벨 추정',
      }) as HTMLMeterElement
    ).value,
  ).toBe(1);
});

function wav(format: 1 | 3, samples: number[]) {
  const bits = format === 3 ? 32 : 16;
  const data = samples.length * (bits / 8);
  const view = new DataView(new ArrayBuffer(44 + data));
  const text = (at: number, value: string) =>
    [...value].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + data, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint16(34, bits, true);
  text(36, 'data');
  view.setUint32(40, data, true);
  samples.forEach((v, i) =>
    format === 3
      ? view.setFloat32(44 + i * 4, v, true)
      : view.setInt16(44 + i * 2, v, true),
  );
  return view.buffer;
}

it('준비한 분리 음원 WAV의 최대값을 읽고, 목록이 없으면 그 값을 쓴다', () => {
  expect(wavPeak(wav(3, [0.1, -1.25, 0.5]))).toBeCloseTo(1.25);
  expect(wavPeak(wav(1, [100, -16384]))).toBe(0.5);
  expect(wavPeak(new ArrayBuffer(8))).toBeNull();
  const stemId = '00000000-0000-4000-8000-000000000009';
  const c = controller({ stemPeaks: { [stemId]: 0.5 } });
  const mix = {
    ...c.mix!,
    masterGain: 1,
    layers: [
      {
        kind: 'STEM' as const,
        id: stemId,
        gain: 0.5,
        mute: false,
        solo: false,
        offsetMs: 0,
      },
    ],
  };
  expect(layerLevels(mix, c, null).levels).toEqual([0.25]);
});

it('재생 중에만 실시간 레벨을 보여 주고, 1.0 이상이면 실시간 클리핑을 알린다', async () => {
  vi.stubGlobal('innerWidth', 1440);
  vi.stubGlobal('innerHeight', 900);
  live.peak = 0.42;
  const c = controller();
  const { rerender } = render(
    <BottomMixer controller={c} enabled locked={false} />,
  );
  expect(screen.getByText('실시간 —')).toBeTruthy();
  rerender(<BottomMixer controller={c} enabled locked={false} playing />);
  expect(await screen.findByText('실시간 0.42')).toBeTruthy();
  expect(screen.queryByText(/실시간 클리핑/)).toBeNull();
  live.peak = 1.3;
  expect(await screen.findByText(/실시간 클리핑 발생/)).toBeTruthy();
  expect(
    (
      screen.getByRole('meter', {
        name: '마스터 실시간 레벨',
      }) as HTMLMeterElement
    ).value,
  ).toBe(1);
  // 정지하면 측정을 멈추고 엿듣기 자원을 닫습니다.
  const closed = live.closed;
  rerender(<BottomMixer controller={c} enabled locked={false} />);
  expect(screen.getByText('실시간 —')).toBeTruthy();
  expect(screen.queryByText(/실시간 클리핑/)).toBeNull();
  expect(live.closed).toBe(closed + 1);
});
