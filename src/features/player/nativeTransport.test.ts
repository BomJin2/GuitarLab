import { afterEach, expect, it, vi } from 'vitest';
import { NativeTransport, type nativePlaybackApi } from './nativeTransport';
import { PlayerEngine } from './PlayerEngine';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const ready = {
  prepared: true,
  playing: true,
  positionMs: 0,
  loopCount: 0,
  rate: 1,
  errorCode: null,
};
function fakeApi() {
  return {
    prepare: vi.fn(),
    update: vi.fn(),
    transport: vi.fn().mockResolvedValue(ready),
    read: vi.fn().mockResolvedValue(ready),
    release: vi.fn().mockResolvedValue(undefined),
    metronome: vi.fn().mockResolvedValue(undefined),
    countIn: vi.fn().mockResolvedValue(undefined),
  } as unknown as typeof nativePlaybackApi & {
    transport: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    metronome: ReturnType<typeof vi.fn>;
    countIn: ReturnType<typeof vi.fn>;
  };
}

it('재생 위치를 추정하고 구간 끝에서 Rust처럼 되감으며, 정지·이동·음량은 위치를 지키며 보낸다(docs/12 네이티브 재생 v1)', async () => {
  vi.useFakeTimers();
  const api = fakeApi();
  const t = new NativeTransport(api, 10000);
  await t.play(1000);
  expect(api.transport).toHaveBeenLastCalledWith({
    playing: true,
    positionMs: 1000,
    volume: 1,
    loop: null,
    rate: 1,
  });
  vi.advanceTimersByTime(200);
  expect(t.timeMs()).toBeCloseTo(1200, -1);
  t.setLoop({ startMs: 1000, endMs: 1500 });
  expect(api.transport).toHaveBeenLastCalledWith(
    expect.objectContaining({
      positionMs: null,
      loop: { startMs: 1000, endMs: 1500 },
    }),
  );
  vi.advanceTimersByTime(400);
  // 1200 + 400 = 1600 → 구간(1000~1500) 안으로 되감은 1100
  expect(t.timeMs()).toBeCloseTo(1100, -1);
  t.setVolume(0.5);
  expect(api.transport).toHaveBeenLastCalledWith(
    expect.objectContaining({ positionMs: null, volume: 0.5 }),
  );
  t.pause();
  const paused = t.timeMs();
  vi.advanceTimersByTime(1000);
  expect(t.timeMs()).toBe(paused);
  expect(api.transport).toHaveBeenLastCalledWith(
    expect.objectContaining({ playing: false, positionMs: paused }),
  );
  t.seek(3000);
  expect(t.timeMs()).toBe(3000);
  t.dispose();
  expect(api.release).toHaveBeenCalledTimes(1);
  t.dispose();
  expect(api.release).toHaveBeenCalledTimes(1);
});

it('재생 중 Rust 위치와 크게 어긋나면 맞추고, 준비가 풀리면 한 번만 알린다', async () => {
  vi.useFakeTimers();
  const api = fakeApi();
  const t = new NativeTransport(api, 10000);
  const lost = vi.fn();
  t.onLost = lost;
  await t.play(0);
  api.read.mockResolvedValueOnce({ ...ready, positionMs: 5000 });
  await vi.advanceTimersByTimeAsync(250);
  expect(t.timeMs()).toBeGreaterThanOrEqual(5000);
  expect(t.timeMs()).toBeLessThan(5100);
  api.read.mockResolvedValue({
    ...ready,
    prepared: false,
    errorCode: 'MONITOR_OUTPUT_UNAVAILABLE',
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(lost).toHaveBeenCalledTimes(1);
  expect(lost).toHaveBeenCalledWith('MONITOR_OUTPUT_UNAVAILABLE');
  t.dispose();
});

it('PlayerEngine은 네이티브가 붙으면 HTMLAudio 대신 Rust로 재생하고, 배속도 Rust로 보낸다(R5)', async () => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fixture'),
    revokeObjectURL: vi.fn(),
  });
  const engine = new PlayerEngine();
  engine.load(new Blob(['fixture']));
  Object.defineProperty(engine.audio, 'duration', {
    value: 4,
    configurable: true,
  });
  engine.audio.dispatchEvent(new Event('loadedmetadata'));
  const htmlPlay = vi.spyOn(engine.audio, 'play').mockResolvedValue();
  const api = fakeApi();
  const t = new NativeTransport(api, 4000);
  const lost = vi.fn();
  t.onLost = lost;
  engine.seek(1500);
  engine.setVolume(0.4);
  engine.attachNative(t);
  expect(engine.nativeAttached).toBe(true);
  expect(api.transport).toHaveBeenCalledWith(
    expect.objectContaining({ playing: false, positionMs: 1500, volume: 0.4 }),
  );
  await engine.play();
  expect(htmlPlay).not.toHaveBeenCalled();
  expect(api.transport).toHaveBeenLastCalledWith(
    expect.objectContaining({ playing: true, positionMs: 1500 }),
  );
  expect(engine.getSnapshot().status).toBe('playing');
  expect(engine.readClock().playing).toBe(true);
  engine.setRate(0.75);
  expect(engine.nativeAttached).toBe(true);
  expect(lost).not.toHaveBeenCalled();
  expect(api.release).not.toHaveBeenCalled();
  expect(api.transport).toHaveBeenLastCalledWith(
    expect.objectContaining({ rate: 0.75, positionMs: null }),
  );
  expect(engine.readClock().rate).toBe(0.75);
  expect(engine.getSnapshot().status).toBe('playing');
  engine.dispose();
});

it('배속이면 화면 위치를 경과 시간 × 속도로 추정하고 Rust 스냅샷 속도를 검사한다(R5)', async () => {
  vi.useFakeTimers();
  const api = fakeApi();
  const t = new NativeTransport(api, 10000);
  t.setRate(1.5);
  await t.play(1000);
  expect(api.transport).toHaveBeenLastCalledWith(
    expect.objectContaining({ playing: true, positionMs: 1000, rate: 1.5 }),
  );
  vi.advanceTimersByTime(200);
  expect(t.timeMs()).toBeCloseTo(1300, -1);
  t.setRate(0.5);
  vi.advanceTimersByTime(200);
  expect(t.timeMs()).toBeCloseTo(1400, -1);
  t.dispose();
});

it('네이티브 재생 중 메트로놈·카운트인은 Rust로 보내고 WebAudio를 쓰지 않는다(R3)', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fixture'),
    revokeObjectURL: vi.fn(),
  });
  const contexts = vi.fn();
  vi.stubGlobal('AudioContext', function () {
    contexts();
    return {
      state: 'running',
      currentTime: 0,
      resume: () => Promise.resolve(),
      close: () => Promise.resolve(),
      createOscillator: vi.fn(),
      createGain: vi.fn(),
      destination: {},
    };
  });
  const engine = new PlayerEngine();
  engine.load(new Blob(['fixture']));
  Object.defineProperty(engine.audio, 'duration', {
    value: 4,
    configurable: true,
  });
  engine.audio.dispatchEvent(new Event('loadedmetadata'));
  const api = fakeApi();
  engine.attachNative(new NativeTransport(api, 4000));
  expect(api.metronome).toHaveBeenLastCalledWith(null);
  engine.setTiming({
    bpm: 120,
    numerator: 3,
    denominator: 4,
    beatOriginMs: 100,
  });
  await engine.setMetronome(true);
  expect(api.metronome).toHaveBeenLastCalledWith({
    originMs: 100,
    beatMs: 500,
    numerator: 3,
    volume: 0.15,
  });
  engine.setMetronomeVolume(0.3);
  expect(api.metronome).toHaveBeenLastCalledWith(
    expect.objectContaining({ volume: 0.3 }),
  );
  const created = contexts.mock.calls.length;
  const counting = engine.countIn(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(api.countIn).toHaveBeenCalledWith({
    count: 3,
    intervalMs: 500,
    numerator: 3,
    volume: 0.3,
  });
  expect(contexts.mock.calls.length).toBe(created);
  await vi.advanceTimersByTimeAsync(2000);
  await counting;
  expect(api.transport).toHaveBeenLastCalledWith(
    expect.objectContaining({ playing: true }),
  );
  await engine.setMetronome(false);
  expect(api.metronome).toHaveBeenLastCalledWith(null);
  engine.dispose();
});

it('네이티브 구간 반복이 되감기면 새 재생 세대를 알리고, 카운트인 중 정지는 Rust에도 정지를 보낸다(리뷰 R1-1·R1-4)', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fixture'),
    revokeObjectURL: vi.fn(),
  });
  const engine = new PlayerEngine();
  engine.load(new Blob(['fixture']));
  Object.defineProperty(engine.audio, 'duration', {
    value: 4,
    configurable: true,
  });
  engine.audio.dispatchEvent(new Event('loadedmetadata'));
  const api = fakeApi();
  const t = new NativeTransport(api, 4000);
  engine.attachNative(t);
  // Rust 위치는 화면 추정과 같다고 둡니다(보정으로 기준점이 바뀌지 않게).
  api.read.mockImplementation(async () => ({
    ...ready,
    positionMs: t.timeMs(),
  }));
  engine.setLoop({ startMs: 1000, endMs: 1500 });
  engine.seek(1000);
  await engine.play();
  const tick = () => (engine as unknown as { update: () => void }).update();
  tick();
  const epoch = engine.getSnapshot().playbackEpoch;
  // 화면 갱신이 600ms 늦어 1200 → 1300(경계를 지나 다시 증가)이어도 회차로 셉니다.
  await vi.advanceTimersByTimeAsync(600);
  expect(t.loopIteration()).toBe(1);
  tick();
  expect(engine.getSnapshot().playbackEpoch).toBe(epoch + 1);
  tick();
  expect(engine.getSnapshot().playbackEpoch).toBe(epoch + 1);
  // Rust 되감기 횟수가 더 크면 그 값을 따릅니다.
  api.read.mockResolvedValue({ ...ready, positionMs: 1100, loopCount: 3 });
  await vi.advanceTimersByTimeAsync(250);
  expect(t.loopIteration()).toBe(3);
  tick();
  expect(engine.getSnapshot().playbackEpoch).toBe(epoch + 2);
  engine.pause();
  const counting = engine.countIn(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(engine.getSnapshot().status).toBe('countIn');
  api.transport.mockClear();
  engine.pause();
  expect(api.transport).toHaveBeenCalledWith(
    expect.objectContaining({ playing: false }),
  );
  await vi.advanceTimersByTimeAsync(3000);
  await counting;
  engine.dispose();
});

it('이동 전에 보낸 위치 조회가 늦게 와도 새 위치를 되돌리지 않는다(리뷰 R2-5)', async () => {
  vi.useFakeTimers();
  const api = fakeApi();
  let answer: (value: typeof ready) => void = () => {};
  api.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const t = new NativeTransport(api, 20000);
  await t.play(0);
  await vi.advanceTimersByTimeAsync(250);
  t.seek(10000);
  answer({ ...ready, positionMs: 250 });
  await vi.advanceTimersByTimeAsync(0);
  expect(t.timeMs()).toBeGreaterThanOrEqual(10000);
  t.dispose();
});

it('위치 조회는 하나씩만 보내 같은 세대 응답이 역순으로 와도 위치가 되돌아가지 않는다(리뷰 R3-1)', async () => {
  vi.useFakeTimers();
  const api = fakeApi();
  let answer: (value: typeof ready) => void = () => {};
  api.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const t = new NativeTransport(api, 20000);
  await t.play(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(api.read).toHaveBeenCalledTimes(1);
  answer({ ...ready, positionMs: 1000 });
  await vi.advanceTimersByTimeAsync(250);
  expect(api.read).toHaveBeenCalledTimes(2);
  t.dispose();
});
