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
