import { describe, it, expect, vi, afterEach } from 'vitest';
import { PlayerEngine } from './PlayerEngine';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function loaded() {
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
  return engine;
}
describe('재생 상태 계약', () => {
  it('새 플레이어는 서버보다 이전 epoch를 재사용하지 않는다', () => {
    const e = loaded();
    e.synchronizeEpochFloor(10);
    expect(e.getSnapshot().playbackEpoch).toBe(11);
    e.synchronizeEpochFloor(5);
    expect(e.getSnapshot().playbackEpoch).toBe(11);
    expect(() => e.synchronizeEpochFloor(Number.MAX_SAFE_INTEGER)).toThrow();
    e.dispose();
  });
  it('seek·rate·pause는 epoch를 새로 만들고 잘못된 입력을 거부한다', () => {
    const e = loaded();
    const epoch = e.getSnapshot().playbackEpoch;
    e.seek(2000);
    expect(e.getSnapshot().audioTimeMs).toBe(2000);
    e.setRate(0.75);
    e.pause();
    expect(e.getSnapshot().playbackEpoch).toBe(epoch + 3);
    expect(() => e.seek(-1)).toThrow();
    expect(() => e.seek(5000)).toThrow();
    expect(() => e.setRate(NaN)).toThrow();
    expect(() => e.setRate(2)).toThrow();
    e.dispose();
  });
  it('loop 종료를 넘어가면 시작으로 이동하고 epoch가 바뀐다', () => {
    const e = loaded();
    e.setLoop({ startMs: 500, endMs: 2000 });
    Object.defineProperty(e.audio, 'paused', {
      value: false,
      configurable: true,
    });
    const epoch = e.getSnapshot().playbackEpoch;
    e.audio.currentTime = 2.1;
    e.audio.dispatchEvent(new Event('timeupdate'));
    expect(e.getSnapshot().audioTimeMs).toBe(500);
    expect(e.getSnapshot().playbackEpoch).toBe(epoch + 1);
    e.dispose();
  });
  it('재생 거부를 복구 가능한 오류로 노출한다', async () => {
    const e = loaded();
    vi.spyOn(e.audio, 'play').mockRejectedValue(new Error('민감한 정보'));
    await e.play();
    expect(e.getSnapshot().status).toBe('error');
    expect(e.getSnapshot().error).not.toContain('민감');
    e.dispose();
  });
});

it('이전 재생 실패는 새 음원의 상태를 바꾸지 않는다', async () => {
  const e = loaded();
  let reject: (error: unknown) => void = () => undefined;
  vi.spyOn(e.audio, 'play').mockImplementation(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  const pending = e.play();
  const previous = e.audio;
  e.load(new Blob(['new']));
  Object.defineProperty(e.audio, 'duration', { value: 3, configurable: true });
  e.audio.dispatchEvent(new Event('loadedmetadata'));
  reject(new Error('old canceled'));
  await pending;
  expect(e.getSnapshot().status).toBe('paused');
  expect(e.getSnapshot().durationMs).toBe(3000);
  expect(e.getSnapshot().error).toBeNull();
  previous.dispatchEvent(new Event('error'));
  expect(e.getSnapshot().error).toBeNull();
  e.dispose();
});
it('이전 재생 성공은 새 음원을 일시정지하지 않는다', async () => {
  const e = loaded();
  let resolve: () => void = () => undefined;
  vi.spyOn(e.audio, 'play').mockImplementation(
    () =>
      new Promise<void>((ok) => {
        resolve = ok;
      }),
  );
  const pending = e.play();
  e.load(new Blob(['new']));
  const pause = vi.spyOn(e.audio, 'pause');
  resolve();
  await pending;
  expect(pause).not.toHaveBeenCalled();
  expect(e.getSnapshot().status).toBe('loading');
  e.dispose();
});
it('음원 교체·취소는 loop와 loading 상태를 초기화한다', () => {
  const e = loaded();
  e.setLoop({ startMs: 0, endMs: 2000 });
  expect(e.getSnapshot().loop).toEqual({ startMs: 0, endMs: 2000 });
  e.load(new Blob(['new']));
  expect(e.getSnapshot().loop).toBeNull();
  e.cancelLoad();
  expect(e.getSnapshot().status).toBe('empty');
  expect(e.getSnapshot().durationMs).toBe(0);
  e.dispose();
});

function makeOscillator() {
  return {
    frequency: { value: 0 },
    onended: () => undefined,
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}
class FakeContext {
  state = 'running';
  currentTime = 5;
  destination = {};
  oscillators: Array<ReturnType<typeof makeOscillator>> = [];
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createOscillator() {
    const oscillator = makeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    return { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  }
}
it('90 BPM 3/4와 0.5배속 카운트인은 3개 클릭 후 4초 뒤 재생한다', async () => {
  vi.useFakeTimers();
  const context = new FakeContext();
  vi.stubGlobal('AudioContext', function () {
    return context;
  });
  const e = loaded();
  e.setTiming({ bpm: 90, numerator: 3, denominator: 4 });
  e.setRate(0.5);
  const play = vi.spyOn(e.audio, 'play').mockResolvedValue();
  const pending = e.countIn(1);
  await Promise.resolve();
  expect(e.getSnapshot().status).toBe('countIn');
  expect(context.oscillators).toHaveLength(3);
  expect(context.oscillators[1]?.start.mock.calls[0]?.[0]).toBeCloseTo(
    5.05 + 4 / 3,
  );
  await vi.advanceTimersByTimeAsync(4049);
  expect(play).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2);
  await pending;
  expect(play).toHaveBeenCalledTimes(1);
  e.dispose();
});
it('3초 준비는 템포와 배속에 관계없이 3클릭·3→2→1 후 재생한다', async () => {
  vi.useFakeTimers();
  for (const rate of [0.5, 1, 1.5]) {
    const context = new FakeContext();
    vi.stubGlobal('AudioContext', function () {
      return context;
    });
    const e = loaded();
    e.setTiming({ bpm: 90, numerator: 3, denominator: 4 });
    e.setRate(rate);
    const play = vi.spyOn(e.audio, 'play').mockResolvedValue();
    const pending = e.prepare();
    await Promise.resolve();
    expect(e.getSnapshot().countInRemainingMs).toBe(3000);
    expect(e.readClock().playing).toBe(false);
    expect(context.oscillators).toHaveLength(3);
    expect(context.oscillators[1]?.start.mock.calls[0]?.[0]).toBeCloseTo(6.05);
    await vi.advanceTimersByTimeAsync(1000);
    expect(Math.ceil(e.getSnapshot().countInRemainingMs / 1000)).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(Math.ceil(e.getSnapshot().countInRemainingMs / 1000)).toBe(1);
    await vi.advanceTimersByTimeAsync(1049);
    expect(play).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    await pending;
    expect(play).toHaveBeenCalledTimes(1);
    expect(e.getSnapshot().countInRemainingMs).toBe(0);
    e.dispose();
  }
});
it('3초 준비의 pause·seek·배속·반복·교체·종료 취소는 지연 재생을 남기지 않는다', async () => {
  vi.useFakeTimers();
  for (const action of ['pause', 'seek', 'rate', 'loop', 'load', 'dispose']) {
    const context = new FakeContext();
    vi.stubGlobal('AudioContext', function () {
      return context;
    });
    const e = loaded();
    const play = vi.spyOn(e.audio, 'play').mockResolvedValue();
    const pending = e.prepare();
    await Promise.resolve();
    if (action === 'pause') e.pause();
    else if (action === 'seek') e.seek(500);
    else if (action === 'rate') e.setRate(0.75);
    else if (action === 'loop') e.setLoop({ startMs: 0, endMs: 2000 });
    else if (action === 'load') e.load(new Blob(['new']));
    else e.dispose();
    await pending;
    expect(e.getSnapshot().countInRemainingMs).toBe(0);
    await vi.advanceTimersByTimeAsync(4000);
    expect(play).not.toHaveBeenCalled();
    e.dispose();
  }
});
it('3초 준비의 늦은 출력 준비 응답은 취소를 되돌리지 않는다', async () => {
  vi.useFakeTimers();
  let resume: () => void = () => undefined;
  const context = new FakeContext();
  context.resume = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resume = resolve;
      }),
  );
  vi.stubGlobal('AudioContext', function () {
    return context;
  });
  const e = loaded();
  const play = vi.spyOn(e.audio, 'play').mockResolvedValue();
  const pending = e.prepare();
  e.pause();
  resume();
  await pending;
  await vi.advanceTimersByTimeAsync(4000);
  expect(context.oscillators).toHaveLength(0);
  expect(play).not.toHaveBeenCalled();
  expect(e.getSnapshot().status).toBe('paused');
  e.dispose();
});
it('카운트인 취소 후 예약 클릭과 지연 재생이 남지 않는다', async () => {
  vi.useFakeTimers();
  const context = new FakeContext();
  vi.stubGlobal('AudioContext', function () {
    return context;
  });
  const e = loaded();
  const play = vi.spyOn(e.audio, 'play').mockResolvedValue();
  const pending = e.countIn(2);
  await Promise.resolve();
  e.pause();
  context.oscillators.forEach((oscillator) =>
    expect(oscillator.stop).toHaveBeenCalledTimes(2),
  );
  await vi.advanceTimersByTimeAsync(5000);
  await pending;
  expect(play).not.toHaveBeenCalled();
  expect(e.getSnapshot().status).toBe('paused');
  e.dispose();
});
it('늦은 메트로놈 enable 완료는 뒤의 disable을 덮어쓰지 않는다', async () => {
  let resolve: () => void = () => undefined;
  const context = new FakeContext();
  context.resume = vi.fn(
    () =>
      new Promise<void>((ok) => {
        resolve = ok;
      }),
  );
  vi.stubGlobal('AudioContext', function () {
    return context;
  });
  const e = loaded();
  const pending = e.setMetronome(true);
  await e.setMetronome(false);
  resolve();
  await pending;
  expect(e.getSnapshot().metronomeEnabled).toBe(false);
  e.dispose();
});

it('StrictMode 수명 재설정 후 빈 상태와 새 음원 로드가 일관된다', () => {
  const e = loaded();
  e.dispose();
  expect(e.getSnapshot().status).toBe('empty');
  expect(e.getSnapshot().durationMs).toBe(0);
  e.activate();
  e.load(new Blob(['new']));
  Object.defineProperty(e.audio, 'duration', { value: 2, configurable: true });
  e.audio.dispatchEvent(new Event('loadedmetadata'));
  expect(e.getSnapshot().durationMs).toBe(2000);
  expect(e.getSnapshot().status).toBe('paused');
  e.dispose();
});

it('메트로놈은 인트로 전에는 클릭하지 않고 마디 시작에서 강박을 생성한다', async () => {
  const context = new FakeContext();
  vi.stubGlobal('AudioContext', function () {
    return context;
  });
  const e = loaded();
  e.setTiming({ bpm: 120, numerator: 4, denominator: 4, beatOriginMs: 2000 });
  await e.setMetronome(true);
  Object.defineProperty(e.audio, 'paused', {
    value: false,
    configurable: true,
  });
  e.audio.currentTime = 1;
  e.audio.dispatchEvent(new Event('timeupdate'));
  expect(context.oscillators).toHaveLength(0);
  e.audio.currentTime = 2;
  e.audio.dispatchEvent(new Event('timeupdate'));
  expect(context.oscillators).toHaveLength(1);
  expect(context.oscillators[0]?.frequency.value).toBe(1200);
  e.dispose();
});
