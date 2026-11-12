import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { nativePlaybackApi } from './nativeTransport';
import type { MixDocument } from '../performance/mixing';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it('이전 해제가 끝난 뒤에야 다음 준비를 보낸다(리뷰 R6-2)', async () => {
  const order: string[] = [];
  let finishRelease: () => void = () => {};
  vi.mocked(invoke).mockImplementation(async (command) => {
    order.push(`${command}:start`);
    if (command === 'release_native_playback')
      await new Promise<void>((resolve) => {
        finishRelease = resolve;
      });
    order.push(`${command}:end`);
    return command === 'prepare_native_playback'
      ? { schemaVersion: 1, sampleRate: 48000, durationMs: 1000 }
      : undefined;
  });
  const releasing = nativePlaybackApi.release();
  const preparing = nativePlaybackApi.prepare('out', {} as MixDocument);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(order).toEqual(['release_native_playback:start']);
  finishRelease();
  await releasing;
  await preparing;
  expect(order).toEqual([
    'release_native_playback:start',
    'release_native_playback:end',
    'prepare_native_playback:start',
    'prepare_native_playback:end',
  ]);
});

it('믹스 설정 변경은 보낸 순서대로 하나씩 적용한다(리뷰 R8-2)', async () => {
  const order: string[] = [];
  let finishFirst: () => void = () => {};
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const gain = (args as { request: { mix: { masterGain: number } } }).request
      .mix.masterGain;
    order.push(`start:${gain}`);
    if (gain === 0.1)
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    order.push(`end:${gain}`);
  });
  const first = nativePlaybackApi.update({ masterGain: 0.1 } as MixDocument);
  const second = nativePlaybackApi.update({ masterGain: 0.9 } as MixDocument);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(order).toEqual(['start:0.1']);
  finishFirst();
  await first;
  await second;
  expect(order).toEqual(['start:0.1', 'end:0.1', 'start:0.9', 'end:0.9']);
});

it('전송 스냅샷의 재생 속도는 0.5~1.5만 받는다(R5)', async () => {
  const snapshot = {
    schemaVersion: 1,
    prepared: true,
    playing: true,
    positionMs: 0,
    loopCount: 0,
    errorCode: null,
  };
  const request = {
    playing: true,
    positionMs: 0,
    volume: 1,
    loop: null,
    rate: 1.25,
  };
  vi.mocked(invoke).mockResolvedValue({ ...snapshot, rate: 1.25 });
  await expect(nativePlaybackApi.transport(request)).resolves.toMatchObject({
    rate: 1.25,
  });
  expect(invoke).toHaveBeenLastCalledWith('set_native_transport', {
    request: { schemaVersion: 1, ...request },
  });
  for (const rate of [2, 0.25, Number.NaN, undefined]) {
    vi.mocked(invoke).mockResolvedValue({ ...snapshot, rate });
    await expect(nativePlaybackApi.transport(request)).rejects.toThrow(
      'NATIVE_CONTRACT_INVALID',
    );
  }
});
