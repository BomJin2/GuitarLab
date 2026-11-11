import { afterEach, expect, it, vi } from 'vitest';
import { PlayerEngine } from '../player/PlayerEngine';
import {
  TakeMixPlayer,
  takeTimeMs,
  type MixPlaybackEntry,
} from './TakeMixPlayer';
import {
  recordingFixture,
  recordingWaveFixture,
} from '../../test/recordingFixture';
import type { MixDocument } from './mixing';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['STEM', 'IMPORTED_STEM'] as const)(
  '%s과 TAKE를 구분해 원본 clock·배속·반복·음소거를 따르고 해제 시 원본 음량을 복원한다',
  async (kind) => {
    const { main, voices, take, mix } = setup();
    const stemId = '00000000-0000-4000-8000-000000000099';
    mix.layers[0] = {
      kind,
      id: stemId,
      gain: 0.6,
      mute: false,
      solo: false,
      offsetMs: 100,
    };
    const player = new TakeMixPlayer(main, vi.fn());
    const bytes = recordingWaveFixture();
    await player.prepare(
      mix,
      [
        { kind, stemId, projectId: mix.projectId, bytes },
        { take, bytes },
      ],
      new AbortController().signal,
    );
    const [stem, recorded] = voices;
    if (!stem || !recorded) throw new Error('테스트 음원 2개 필요');
    expect(main.audio.volume).toBe(0);
    main.seek(1500);
    await main.play();
    await Promise.resolve();
    expect(stem.currentTime).toBeCloseTo(1.4);
    expect(recorded.currentTime).toBeCloseTo(1);
    expect(stem.volume).toBeCloseTo(0.3);
    expect(stem.playbackRate).toBe(1);
    main.setRate(0.5);
    expect(stem.playbackRate).toBe(0.5);
    expect(recorded.playbackRate).toBe(1);
    mix.layers[0].solo = true;
    player.update(mix);
    expect(recorded.volume).toBe(0);
    mix.layers[0].mute = true;
    player.update(mix);
    expect(stem.volume).toBe(0);
    main.setLoop({ startMs: 1000, endMs: 2500 });
    main.audio.currentTime = 2.6;
    main.audio.dispatchEvent(new Event('timeupdate'));
    expect(main.getSnapshot().audioTimeMs).toBe(1000);
    expect(stem.currentTime).toBeCloseTo(0.9);
    main.pause();
    expect(stem.paused).toBe(true);
    expect(recorded.paused).toBe(true);
    player.clear();
    expect(main.audio.volume).toBe(0.8);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    main.dispose();
  },
);

it.each(['STEM', 'IMPORTED_STEM'] as const)(
  '누락·중복·다른 프로젝트/종류의 %s 입력을 거부하고 재생 실패 시 기준 반주도 중단한다',
  async (kind) => {
    const { main, take, mix } = setup();
    const stemId = '00000000-0000-4000-8000-000000000099';
    mix.layers = [
      {
        kind,
        id: stemId,
        gain: 1,
        mute: false,
        solo: false,
        offsetMs: 0,
      },
    ];
    const entry = {
      kind,
      stemId,
      projectId: mix.projectId,
      bytes: recordingWaveFixture(),
    };
    const fail = vi.fn();
    const player = new TakeMixPlayer(main, fail);
    for (const entries of [
      [],
      [entry, entry],
      [{ ...entry, projectId: take.id }],
      [{ ...entry, kind: kind === 'STEM' ? 'IMPORTED_STEM' : 'STEM' }],
    ] satisfies MixPlaybackEntry[][])
      await expect(
        player.prepare(mix, entries, new AbortController().signal),
      ).rejects.toThrow('MIX_CONTRACT_INVALID');
    await player.prepare(mix, [entry], new AbortController().signal);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      return this === main.audio
        ? Promise.resolve()
        : Promise.reject(new Error('테스트 출력 중단'));
    });
    main.seek(1000);
    await main.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(fail).toHaveBeenCalledTimes(1);
    expect(main.getSnapshot().status).toBe('paused');
    expect(main.audio.volume).toBe(0.8);
    main.dispose();
  },
);
function setup() {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:mix-${Math.random()}`),
    revokeObjectURL: vi.fn(),
  });
  const main = new PlayerEngine();
  main.load(new Blob(['synthetic']));
  Object.defineProperty(main.audio, 'duration', { value: 12 });
  main.audio.dispatchEvent(new Event('loadedmetadata'));
  main.setVolume(0.8);
  const voices: HTMLAudioElement[] = [];
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    if (this === main.audio) return;
    voices.push(this);
    Object.defineProperty(this, 'duration', { value: 4, configurable: true });
    queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
  });
  const take = recordingFixture();
  const mix: MixDocument = {
    schemaVersion: 1,
    projectId: take.projectId,
    masterGain: 0.5,
    layers: [
      {
        kind: 'LOCAL_ASSET',
        id: take.transport?.backingAssetId ?? '',
        gain: 0.6,
        mute: false,
        solo: false,
        offsetMs: 0,
      },
      {
        kind: 'TAKE',
        id: take.id,
        gain: 0.8,
        mute: false,
        solo: false,
        offsetMs: 10,
      },
    ],
  };
  return { main, voices, take, mix };
}
it('별도 media로 정렬·배속·seek·pause·solo를 따르고 원곡과 녹음 bytes를 바꾸지 않는다', async () => {
  const { main, voices, take, mix } = setup();
  const fail = vi.fn();
  const player = new TakeMixPlayer(main, fail);
  const media = main.audio;
  const bytes = recordingWaveFixture();
  const original = new Uint8Array(bytes).slice();
  await player.prepare(mix, [{ take, bytes }], new AbortController().signal);
  const voice = voices[0];
  if (!voice) throw new Error('참조 media 필요');
  expect(main.audio).toBe(media);
  expect(main.audio.volume).toBeCloseTo(0.3);
  main.seek(1500);
  await main.play();
  await Promise.resolve();
  expect(voice.currentTime).toBeCloseTo(1);
  expect(voice.playbackRate).toBe(2);
  expect(voice.volume).toBeCloseTo(0.4);
  main.setRate(0.5);
  expect(voice.playbackRate).toBe(1);
  main.seek(1700);
  expect(voice.currentTime).toBeCloseTo(1.4);
  const second = mix.layers[1];
  if (!second) throw new Error('레이어 필요');
  second.solo = true;
  player.update(mix);
  expect(main.audio.volume).toBe(0);
  expect(voice.volume).toBeCloseTo(0.4);
  second.mute = true;
  player.update(mix);
  expect(voice.volume).toBe(0);
  main.pause();
  expect(voice.paused).toBe(true);
  main.seek(500);
  await main.play();
  expect(voice.paused).toBe(true);
  player.clear();
  expect(main.audio.volume).toBe(0.8);
  expect(URL.revokeObjectURL).toHaveBeenCalled();
  expect(fail).not.toHaveBeenCalled();
  expect(
    new Uint8Array(bytes).every((value, index) => value === original[index]),
  ).toBe(true);
  main.dispose();
});
it('재생 실패·취소 시 참조를 정리하고 기준 반주를 멈춘다', async () => {
  const { main, take, mix } = setup();
  const fail = vi.fn();
  const player = new TakeMixPlayer(main, fail);
  await player.prepare(
    mix,
    [{ take, bytes: recordingWaveFixture() }],
    new AbortController().signal,
  );
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return this === main.audio
      ? Promise.resolve()
      : Promise.reject(new Error('output lost'));
  });
  main.seek(1500);
  await main.play();
  await Promise.resolve();
  await Promise.resolve();
  expect(fail).toHaveBeenCalledTimes(1);
  expect(main.getSnapshot().status).toBe('paused');
  expect(main.audio.volume).toBe(0.8);
  const controller = new AbortController();
  controller.abort();
  await expect(
    player.prepare(
      mix,
      [{ take, bytes: recordingWaveFixture() }],
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  main.dispose();
});
it('무반주 수동 오프셋과 저장 배속에 따른 샘플 위치를 구분한다', () => {
  expect(takeTimeMs(recordingFixture(), 1500, 10)).toBe(1000);
  expect(
    takeTimeMs(
      recordingFixture({
        transport: null,
        songStartMs: null,
        alignmentOffsetMs: 50,
      }),
      1500,
      100,
    ),
  ).toBe(1350);
});

it('연속 재생의 짧은 media 시각 차이에 반복 탐색하거나 같은 배속을 재설정하지 않는다', async () => {
  const { main, voices, take, mix } = setup();
  const player = new TakeMixPlayer(main, vi.fn());
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  await player.prepare(
    mix,
    [{ take, bytes: recordingWaveFixture() }],
    new AbortController().signal,
  );
  main.setRate(0.5);
  main.seek(1500);
  await main.play();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const voice = voices[0];
  if (!voice) throw new Error('참조 media 필요');
  let presentedTime = voice.currentTime;
  const seeks = vi.fn();
  Object.defineProperty(voice, 'currentTime', {
    configurable: true,
    get: () => presentedTime,
    set: (value: number) => {
      seeks(value);
      presentedTime = value;
    },
  });
  const rateWrites = vi.spyOn(voice, 'playbackRate', 'set');
  for (let i = 1; i <= 60; i++) {
    now = i * 20;
    const songMs = 1500 + i * 10;
    presentedTime = takeTimeMs(take, songMs, 10) / 1000 - 0.12;
    main.audio.currentTime = songMs / 1000;
    main.audio.dispatchEvent(new Event('timeupdate'));
  }
  expect(seeks).not.toHaveBeenCalled();
  expect(rateWrites).not.toHaveBeenCalled();
  player.clear();
  main.dispose();
});

it('큰 편차는 지속 시간·재보정 간격을 확인하고 명시적 seek·offset은 즉시 적용한다', async () => {
  const { main, voices, take, mix } = setup();
  const player = new TakeMixPlayer(main, vi.fn());
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  await player.prepare(
    mix,
    [{ take, bytes: recordingWaveFixture() }],
    new AbortController().signal,
  );
  main.setRate(0.5);
  main.seek(1500);
  await main.play();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const voice = voices[0];
  if (!voice) throw new Error('참조 media 필요');
  let presentedTime = voice.currentTime;
  const seeks = vi.fn();
  Object.defineProperty(voice, 'currentTime', {
    configurable: true,
    get: () => presentedTime,
    set: (value: number) => {
      seeks(value);
      presentedTime = value;
    },
  });
  const advance = (ms: number) => {
    now = ms;
    const songMs = 1500 + ms * 0.5;
    presentedTime = takeTimeMs(take, songMs, 10) / 1000 - 0.25;
    main.audio.currentTime = songMs / 1000;
    main.audio.dispatchEvent(new Event('timeupdate'));
  };
  advance(1100);
  advance(1500);
  expect(seeks).not.toHaveBeenCalled();
  advance(1601);
  expect(seeks).toHaveBeenCalledTimes(1);
  advance(1700);
  expect(seeks).toHaveBeenCalledTimes(1);
  Object.defineProperty(voice, 'seeking', { configurable: true, value: true });
  advance(2700);
  advance(2800);
  expect(seeks).toHaveBeenCalledTimes(1);
  main.seek(2000);
  expect(seeks).toHaveBeenCalledTimes(2);
  expect(voice.currentTime).toBeCloseTo(2);
  const layer = mix.layers[1];
  if (!layer) throw new Error('레이어 필요');
  layer.offsetMs = 110;
  player.update(mix);
  expect(seeks).toHaveBeenCalledTimes(3);
  expect(voice.currentTime).toBeCloseTo(1.8);
  player.clear();
  main.dispose();
});
it('AmpliTube 재생 레이어는 media 대신 모니터 재생 명령을 보내고 배속·실패 때 원음으로 돌아간다', async () => {
  const { main, voices, take, mix } = setup();
  const snapshot = (takeId: string | null) => ({
    schemaVersion: 1 as const,
    takeId,
    playing: false,
    positionMs: null,
    durationMs: null,
    leadFrames: 0,
  });
  const wet = {
    load: vi.fn(async (_: string, takeId: string | null) => snapshot(takeId)),
    set: vi.fn(async () => snapshot(take.id)),
    status: vi.fn(async () => snapshot(take.id)),
  };
  const onWet = vi.fn();
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const player = new TakeMixPlayer(main, vi.fn(), wet, onWet);
  await player.prepare(
    mix,
    [{ take, bytes: recordingWaveFixture() }],
    new AbortController().signal,
  );
  const voice = voices[0];
  if (!voice) throw new Error('참조 media 필요');
  // 저장 배속 0.5 테이크를 0.5배로 들으면 테이크 기준 1배입니다.
  main.setRate(0.5);
  await player.setWet(take.id);
  expect(wet.load).toHaveBeenCalledWith(take.projectId, take.id);
  expect(onWet).toHaveBeenLastCalledWith(take.id, null);
  main.seek(1700);
  await main.play();
  await flush();
  expect(voice.paused).toBe(true);
  const layer = mix.layers[1];
  if (!layer) throw new Error('레이어 필요');
  expect(wet.set).toHaveBeenLastCalledWith(
    true,
    takeTimeMs(take, main.getSnapshot().audioTimeMs, layer.offsetMs),
  );
  main.pause();
  await flush();
  expect(wet.set).toHaveBeenLastCalledWith(false, expect.any(Number));
  // 1배가 아니면 원음 재생으로 돌아가고 Rust 클립을 내립니다.
  main.setRate(1);
  await flush();
  expect(player.wetTakeId()).toBeNull();
  expect(onWet).toHaveBeenLastCalledWith(null, expect.stringContaining('1배'));
  expect(wet.load).toHaveBeenLastCalledWith(take.projectId, null);
  // 모니터가 꺼져 명령이 실패해도 원음으로 돌아갑니다.
  main.setRate(0.5);
  await player.setWet(take.id);
  wet.set.mockRejectedValueOnce({ code: 'PLAYBACK_NOT_LOADED' });
  await main.play();
  await flush();
  expect(player.wetTakeId()).toBeNull();
  expect(onWet).toHaveBeenLastCalledWith(
    null,
    expect.stringContaining('모니터가 꺼져'),
  );
  player.clear();
  main.dispose();
});
it('AmpliTube 재생 위치 확인 응답이 일시정지 뒤에 늦게 와도 다시 재생하지 않는다', async () => {
  const { main, take, mix } = setup();
  const snapshot = (positionMs: number | null) => ({
    schemaVersion: 1 as const,
    takeId: take.id,
    playing: true,
    positionMs,
    durationMs: null,
    leadFrames: 0,
  });
  let release: (value: ReturnType<typeof snapshot>) => void = () => {};
  const wet = {
    load: vi.fn(async () => snapshot(null)),
    set: vi.fn(async () => snapshot(0)),
    status: vi.fn(
      () =>
        new Promise<ReturnType<typeof snapshot>>((resolve) => {
          release = resolve;
        }),
    ),
  };
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const player = new TakeMixPlayer(main, vi.fn(), wet, vi.fn());
  await player.prepare(
    mix,
    [{ take, bytes: recordingWaveFixture() }],
    new AbortController().signal,
  );
  main.setRate(0.5);
  await player.setWet(take.id);
  main.seek(1700);
  await main.play();
  await flush();
  expect(wet.set).toHaveBeenLastCalledWith(true, expect.any(Number));
  // 2초 뒤 위치 확인을 보내고, 응답 전에 일시정지합니다.
  now = 2500;
  player.update(mix);
  await flush();
  expect(wet.status).toHaveBeenCalledTimes(1);
  main.pause();
  await flush();
  // 크게 벌어진 위치를 늦게 돌려줘도 다시 재생 명령을 보내지 않습니다.
  release(snapshot(0));
  await flush();
  await flush();
  expect(wet.set).toHaveBeenLastCalledWith(false, expect.any(Number));
  expect(
    wet.set.mock.calls.filter((call) => (call as unknown[])[0] === true),
  ).toHaveLength(1);
  player.clear();
  main.dispose();
});
it('Bounce(RENDER) 줄만 있으면 그 원본 테이크를 AmpliTube 실시간 재생으로 고르지 않는다', async () => {
  const { main, take, mix } = setup();
  const renderId = '00000000-0000-4000-8000-000000000099';
  const source = mix.layers[1];
  if (!source) throw new Error('레이어 필요');
  const onlyRender = {
    ...mix,
    layers: [
      mix.layers[0]!,
      { ...source, kind: 'RENDER' as const, id: renderId },
    ],
  };
  const wet = {
    load: vi.fn(),
    set: vi.fn(),
    status: vi.fn(),
  };
  const player = new TakeMixPlayer(main, vi.fn(), wet as never, vi.fn());
  await player.prepare(
    onlyRender,
    [
      {
        kind: 'RENDER',
        stemId: renderId,
        projectId: take.projectId,
        bytes: recordingWaveFixture(),
        source: take,
      },
    ],
    new AbortController().signal,
  );
  await expect(player.setWet(take.id)).rejects.toThrow('MIX_CONTRACT_INVALID');
  expect(wet.load).not.toHaveBeenCalled();
  player.clear();
  main.dispose();
});
it('AmpliTube 테이크 불러오기가 늦게 끝나도 그 사이의 해제(최신 선택)를 덮지 않는다', async () => {
  const { main, take, mix } = setup();
  const snapshot = (takeId: string | null) => ({
    schemaVersion: 1 as const,
    takeId,
    playing: false,
    positionMs: null,
    durationMs: null,
    leadFrames: 0,
  });
  let finish: () => void = () => {};
  const calls: (string | null)[] = [];
  const wet = {
    load: vi.fn((_: string, takeId: string | null) => {
      calls.push(takeId);
      return takeId
        ? new Promise<ReturnType<typeof snapshot>>((resolve) => {
            finish = () => resolve(snapshot(takeId));
          })
        : Promise.resolve(snapshot(null));
    }),
    set: vi.fn(async () => snapshot(take.id)),
    status: vi.fn(async () => snapshot(take.id)),
  };
  const player = new TakeMixPlayer(main, vi.fn(), wet, vi.fn());
  await player.prepare(
    mix,
    [{ take, bytes: recordingWaveFixture() }],
    new AbortController().signal,
  );
  main.setRate(0.5);
  const selecting = player.setWet(take.id);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await player.setWet(null);
  finish();
  await selecting;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(player.wetTakeId()).toBeNull();
  // Rust가 받는 순서도 선택 순서(불러오기 → 해제)라 마지막은 해제입니다.
  expect(calls).toEqual([take.id, null]);
  player.clear();
});
it('AmpliTube 테이크를 불러오는 중에 준비를 해제하면 다시 준비해도 이전 선택이 살아나지 않는다(리뷰 R2-2)', async () => {
  const { main, take, mix } = setup();
  const snapshot = (takeId: string | null) => ({
    schemaVersion: 1 as const,
    takeId,
    playing: false,
    positionMs: null,
    durationMs: null,
    leadFrames: 0,
  });
  let finish: () => void = () => {};
  const calls: (string | null)[] = [];
  const wet = {
    load: vi.fn((_: string, takeId: string | null) => {
      calls.push(takeId);
      return takeId
        ? new Promise<ReturnType<typeof snapshot>>((resolve) => {
            finish = () => resolve(snapshot(takeId));
          })
        : Promise.resolve(snapshot(null));
    }),
    set: vi.fn(async () => snapshot(take.id)),
    status: vi.fn(async () => snapshot(take.id)),
  };
  const player = new TakeMixPlayer(main, vi.fn(), wet, vi.fn());
  const ready = () =>
    player.prepare(
      mix,
      [{ take, bytes: recordingWaveFixture() }],
      new AbortController().signal,
    );
  await ready();
  main.setRate(0.5);
  const selecting = player.setWet(take.id);
  await new Promise((resolve) => setTimeout(resolve, 0));
  player.clear();
  await ready();
  finish();
  await selecting;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(player.wetTakeId()).toBeNull();
  expect(calls).toEqual([take.id, null]);
  player.clear();
});
