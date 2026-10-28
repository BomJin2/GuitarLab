import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalibrationClickClock } from './CalibrationClickClock';

class FakeNode {
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
}
class FakeContext {
  static instances: FakeContext[] = [];
  currentTime = 5;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = {};
  nodes: FakeNode[] = [];
  gains: Array<{
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  }> = [];
  constructor() {
    FakeContext.instances.push(this);
  }
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createOscillator() {
    const node = new FakeNode();
    this.nodes.push(node);
    return node;
  }
  createGain() {
    const gain = {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    this.gains.push(gain);
    return {
      gain,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeContext.instances = [];
});
describe('보정 클릭 출력 clock', () => {
  it('사용자 시작 전에는 출력하지 않고 context clock으로16회만 예약한다', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    const clicks = new CalibrationClickClock();
    expect(clicks.readClock(3).playing).toBe(false);
    expect(FakeContext.instances).toHaveLength(0);
    await clicks.start();
    const context = FakeContext.instances[0];
    expect(context?.nodes).toHaveLength(16);
    expect(context?.nodes[0]?.start).toHaveBeenCalledWith(6);
    expect(context?.nodes[15]?.start).toHaveBeenCalledWith(17.25);
    expect(context?.nodes[0]?.stop).toHaveBeenCalledWith(6.04);
    expect(context?.gains[0]?.setValueAtTime).toHaveBeenCalledWith(0.15, 6);
    expect(
      context?.gains[0]?.exponentialRampToValueAtTime,
    ).toHaveBeenCalledWith(0.001, 6.035);
    if (!context) throw new Error('fixture context 없음');
    context.currentTime = 5.25;
    expect(clicks.readClock(3)).toMatchObject({
      songTimeMs: 250,
      rate: 1,
      playbackEpoch: 3,
      playing: true,
    });
    await clicks.stop();
    await clicks.stop();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(clicks.readClock(3).playing).toBe(false);
  });
  it('유선 모드만 200ms 지속음16개를 제한된 진폭으로 예약한다', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    const clock = new CalibrationClickClock();
    await clock.start('CABLE');
    const context = FakeContext.instances[0];
    expect(context?.nodes).toHaveLength(16);
    expect(context?.nodes[0]?.stop).toHaveBeenCalledWith(6.2);
    expect(context?.nodes[15]?.stop).toHaveBeenCalledWith(17.45);
    expect(context?.gains[0]?.setValueAtTime).toHaveBeenCalledWith(0.001, 6);
    expect(
      context?.gains[0]?.exponentialRampToValueAtTime,
    ).toHaveBeenCalledWith(0.15, 6.002);
    expect(context?.gains[0]?.setValueAtTime).toHaveBeenCalledWith(0.15, 6.18);
    expect(
      context?.gains[0]?.exponentialRampToValueAtTime,
    ).toHaveBeenCalledWith(0.001, 6.2);
    await clock.stop();
    expect(context?.close).toHaveBeenCalledOnce();
  });
  it('취소된 resume 완료가 새 측정의 출력 context를 닫지 않는다', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    let resume: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const clicks = new CalibrationClickClock();
    class DelayedContext extends FakeContext {
      constructor() {
        super();
        if (FakeContext.instances.length === 1)
          this.resume = vi.fn(() => pending);
      }
    }
    vi.stubGlobal('AudioContext', DelayedContext);
    const first = clicks.start();
    const rejected = expect(first).rejects.toThrow('CANCELED');
    await clicks.stop();
    await clicks.start();
    resume();
    await rejected;
    expect(clicks.readClock(4).playing).toBe(true);
    expect(FakeContext.instances[1]?.close).not.toHaveBeenCalled();
    await clicks.stop();
  });
});
