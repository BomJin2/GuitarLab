import { validateLoop } from './sync';
import { countInSeconds, validateTiming, type Timing } from './timing';
import { logDiagnostic } from '../../shared/logger';
export type PlaybackLoop = { startMs: number; endMs: number };
export type PlayerSnapshot = {
  schemaVersion: 1;
  audioTimeMs: number;
  durationMs: number;
  rate: number;
  playbackEpoch: number;
  status: 'empty' | 'paused' | 'playing' | 'loading' | 'error' | 'countIn';
  error: string | null;
  loop: PlaybackLoop | null;
  volume: number;
  metronomeEnabled: boolean;
  metronomeVolume: number;
  countInRemainingMs: number;
  timing: Timing;
};
export class PlayerEngine {
  audio: HTMLAudioElement;
  private url: string | null = null;
  private listeners = new Set<() => void>();
  private frame = 0;
  private generation = 0;
  private context: AudioContext | null = null;
  private clicks = new Set<OscillatorNode>();
  private nextBeatMs = 0;
  private loadTimer: number | undefined;
  private disposed = false;
  private metronomeRequest = 0;
  private cancelCountIn: (() => void) | null = null;
  private snapshot: PlayerSnapshot = {
    schemaVersion: 1,
    audioTimeMs: 0,
    durationMs: 0,
    rate: 1,
    playbackEpoch: 0,
    status: 'empty',
    error: null,
    loop: null,
    volume: 1,
    metronomeEnabled: false,
    metronomeVolume: 0.15,
    countInRemainingMs: 0,
    timing: { bpm: 120, numerator: 4, denominator: 4 },
  };
  constructor() {
    this.audio = this.createAudio();
  }
  private createAudio() {
    const audio = new Audio();
    audio.preservesPitch = true;
    const current = () => !this.disposed && audio === this.audio;
    audio.addEventListener('loadedmetadata', () => {
      if (!current()) return;
      window.clearTimeout(this.loadTimer);
      const durationMs = audio.duration * 1000;
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        this.fail('유효한 음원 길이를 확인할 수 없습니다.');
        return;
      }
      this.publish({ durationMs, status: 'paused' });
    });
    audio.addEventListener('error', () => {
      if (current())
        this.fail('음원을 재생할 수 없습니다. WAV/MP3 형식을 확인하세요.');
    });
    audio.addEventListener('ended', () => {
      if (!current()) return;
      if (this.snapshot.loop) {
        this.seek(this.snapshot.loop.startMs);
        void this.play();
      } else {
        this.stopClicks();
        cancelAnimationFrame(this.frame);
        this.publish({
          status: 'paused',
          audioTimeMs: this.snapshot.durationMs,
        });
      }
    });
    audio.addEventListener('timeupdate', () => {
      if (current()) this.update();
    });
    return audio;
  }
  activate() {
    this.disposed = false;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  synchronizeEpochFloor(floor: number) {
    if (
      !Number.isSafeInteger(floor) ||
      floor < 0 ||
      floor >= Number.MAX_SAFE_INTEGER
    )
      throw new Error('재생 시간 식별자 범위를 확인하세요.');
    if (this.snapshot.playbackEpoch < floor)
      this.publish({ playbackEpoch: floor + 1 });
  }
  readClock = () => ({
    performanceTimeMs: performance.now(),
    songTimeMs: this.audio.currentTime * 1000,
    rate: this.audio.playbackRate,
    playbackEpoch: this.snapshot.playbackEpoch,
    playing:
      this.snapshot.status === 'playing' &&
      !this.audio.paused &&
      !this.audio.seeking &&
      !this.audio.ended,
  });
  private publish(values: Partial<PlayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...values };
    this.listeners.forEach((listener) => listener());
  }
  private fail(message: string) {
    window.clearTimeout(this.loadTimer);
    this.pause();
    this.publish({ status: 'error', error: message });
  }
  private update = () => {
    const position = this.audio.currentTime * 1000;
    const loop = this.snapshot.loop;
    if (loop && !this.audio.paused && position >= loop.endMs) {
      this.seek(loop.startMs);
      return;
    }
    this.publish({ audioTimeMs: position });
    if (
      this.snapshot.metronomeEnabled &&
      !this.audio.paused &&
      this.context?.state === 'running'
    ) {
      const step = this.beatDurationMs();
      if (position >= this.nextBeatMs) {
        const origin = this.snapshot.timing.beatOriginMs ?? 0;
        const beat = Math.round((this.nextBeatMs - origin) / step);
        this.click(
          this.context.currentTime,
          beat % this.snapshot.timing.numerator === 0,
        );
        this.nextBeatMs =
          origin + (Math.floor((position - origin) / step) + 1) * step;
      }
    }
  };
  private animate = () => {
    this.update();
    if (!this.audio.paused && !this.disposed)
      this.frame = requestAnimationFrame(this.animate);
  };
  private stopClicks() {
    this.clicks.forEach((click) => click.stop());
    this.clicks.clear();
  }
  private alignedBeat(ms: number) {
    const origin = this.snapshot.timing.beatOriginMs ?? 0;
    return (
      origin +
      Math.max(0, Math.ceil((ms - origin) / this.beatDurationMs())) *
        this.beatDurationMs()
    );
  }
  private beatDurationMs() {
    return (
      ((4 / this.snapshot.timing.denominator) * 60000) /
      this.snapshot.timing.bpm
    );
  }
  private click(time: number, accent: boolean) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    this.clicks.add(oscillator);
    oscillator.onended = () => {
      this.clicks.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.frequency.value = accent ? 1200 : 800;
    gain.gain.value = this.snapshot.metronomeVolume;
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.04);
  }
  async setMetronome(enabled: boolean) {
    const job = ++this.metronomeRequest;
    if (!enabled) {
      this.stopClicks();
      this.publish({ metronomeEnabled: false });
      return;
    }
    try {
      if (this.context?.state === 'closed') this.context = null;
      this.context ??= new AudioContext();
      await this.context.resume();
      if (job !== this.metronomeRequest || this.disposed) return;
      this.nextBeatMs = this.alignedBeat(this.snapshot.audioTimeMs);
      this.publish({ metronomeEnabled: true, error: null });
    } catch {
      if (job === this.metronomeRequest)
        this.publish({
          metronomeEnabled: false,
          error: '메트로놈을 시작할 수 없습니다.',
        });
    }
  }
  setMetronomeVolume(volume: number) {
    this.validateVolume(volume);
    this.publish({ metronomeVolume: volume });
  }
  setTiming(timing: Timing) {
    validateTiming(timing);
    if (
      this.snapshot.timing.bpm === timing.bpm &&
      this.snapshot.timing.numerator === timing.numerator &&
      this.snapshot.timing.denominator === timing.denominator &&
      this.snapshot.timing.beatOriginMs === timing.beatOriginMs
    )
      return;
    this.publish({ timing });
    this.nextBeatMs = this.alignedBeat(this.snapshot.audioTimeMs);
  }
  load(blob: Blob) {
    if (blob.size === 0 || blob.size > 256 * 1024 * 1024)
      throw new Error('음원은 256MiB 이하의 비어 있지 않은 파일이어야 합니다.');
    this.disposed = false;
    this.pause();
    window.clearTimeout(this.loadTimer);
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio = this.createAudio();
    this.audio.playbackRate = this.snapshot.rate;
    this.audio.volume = this.snapshot.volume;
    this.url = URL.createObjectURL(blob);
    this.publish({
      status: 'loading',
      error: null,
      audioTimeMs: 0,
      durationMs: 0,
      loop: null,
      playbackEpoch: this.snapshot.playbackEpoch + 1,
    });
    this.audio.src = this.url;
    this.audio.load();
    const media = this.audio;
    this.loadTimer = window.setTimeout(() => {
      if (media === this.audio && this.snapshot.status === 'loading')
        this.fail(
          '음원 읽기 시간이 초과되었습니다. 다른 파일을 선택하거나 다시 시도하세요.',
        );
    }, 15000);
  }
  cancelLoad() {
    if (this.snapshot.status !== 'loading') return;
    this.pause();
    window.clearTimeout(this.loadTimer);
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.publish({ status: 'empty', durationMs: 0, error: null, loop: null });
  }
  clear() {
    this.pause();
    window.clearTimeout(this.loadTimer);
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.publish({
      status: 'empty',
      durationMs: 0,
      audioTimeMs: 0,
      error: null,
      loop: null,
    });
  }
  async play() {
    if (!this.url || !this.snapshot.durationMs || this.disposed) return;
    const job = ++this.generation;
    this.cancelCountIn?.();
    this.stopClicks();
    const media = this.audio;
    try {
      await media.play();
      if (job !== this.generation || media !== this.audio || this.disposed)
        return;
      this.publish({ status: 'playing', error: null, countInRemainingMs: 0 });
      this.nextBeatMs = this.alignedBeat(this.snapshot.audioTimeMs);
      cancelAnimationFrame(this.frame);
      this.animate();
    } catch {
      if (job === this.generation && media === this.audio && !this.disposed)
        this.publish({
          status: 'error',
          countInRemainingMs: 0,
          error: '재생을 시작할 수 없습니다. 다시 재생 버튼을 눌러주세요.',
        });
    }
  }
  pause() {
    this.generation++;
    this.cancelCountIn?.();
    this.audio.pause();
    this.stopClicks();
    cancelAnimationFrame(this.frame);
    this.publish({
      status: this.url ? 'paused' : 'empty',
      countInRemainingMs: 0,
      playbackEpoch: this.snapshot.playbackEpoch + 1,
    });
  }
  seek(ms: number) {
    if (!Number.isFinite(ms) || ms < 0 || ms > this.snapshot.durationMs)
      throw new Error('유효한 재생 위치가 아닙니다.');
    if (this.snapshot.status === 'countIn') this.pause();
    this.audio.currentTime = ms / 1000;
    this.stopClicks();
    this.nextBeatMs = this.alignedBeat(ms);
    this.publish({
      audioTimeMs: ms,
      playbackEpoch: this.snapshot.playbackEpoch + 1,
    });
  }
  setRate(rate: number) {
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 1.5)
      throw new Error('배속은 0.5~1.5 범위여야 합니다.');
    if (this.snapshot.status === 'countIn') this.pause();
    this.audio.playbackRate = rate;
    this.publish({ rate, playbackEpoch: this.snapshot.playbackEpoch + 1 });
  }
  private validateVolume(volume: number) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1)
      throw new Error('음량 범위를 확인하세요.');
  }
  setVolume(volume: number) {
    this.validateVolume(volume);
    this.audio.volume = volume;
    this.publish({ volume });
  }
  setLoop(loop: PlaybackLoop | null) {
    if (loop) validateLoop(loop.startMs, loop.endMs, this.snapshot.durationMs);
    if (this.snapshot.status === 'countIn') this.pause();
    this.publish({
      loop: loop ? { ...loop } : null,
      playbackEpoch: this.snapshot.playbackEpoch + 1,
    });
  }
  async countIn(bars: number) {
    const seconds = countInSeconds(
      bars,
      this.snapshot.timing,
      this.snapshot.rate,
    );
    if (bars === 0) {
      await this.play();
      return;
    }
    await this.runCountIn(seconds, bars * this.snapshot.timing.numerator);
  }
  async prepare(beforePlay?: () => Promise<boolean>) {
    await this.runCountIn(3, 3, beforePlay);
  }
  private async runCountIn(
    seconds: number,
    count: number,
    beforePlay?: () => Promise<boolean>,
  ) {
    if (!this.url || !this.snapshot.durationMs || this.disposed) return;
    this.pause();
    const job = this.generation;
    this.publish({
      status: 'countIn',
      error: null,
      countInRemainingMs: seconds * 1000,
    });
    try {
      if (this.context?.state === 'closed') this.context = null;
      this.context ??= new AudioContext();
      const context = this.context;
      await context.resume();
      if (job !== this.generation || this.disposed) return;
      const start = context.currentTime + 0.05;
      const interval = seconds / count;
      for (let beat = 0; beat < count; beat++)
        this.click(
          start + beat * interval,
          beat % this.snapshot.timing.numerator === 0,
        );
      const startedAt = performance.now();
      await new Promise<void>((resolve) => {
        const progress = window.setInterval(() => {
          if (job === this.generation && !this.disposed)
            this.publish({
              countInRemainingMs: Math.max(
                0,
                seconds * 1000 - (performance.now() - startedAt),
              ),
            });
        }, 100);
        const finish = () => {
          window.clearInterval(progress);
          window.clearTimeout(timer);
          if (this.cancelCountIn === finish) this.cancelCountIn = null;
          resolve();
        };
        const timer = window.setTimeout(finish, (0.05 + seconds) * 1000);
        this.cancelCountIn = finish;
      });
      if (job === this.generation && !this.disposed) {
        const ready = beforePlay ? await beforePlay() : true;
        if (job === this.generation && !this.disposed) {
          if (ready) await this.play();
          else this.pause();
        }
      }
    } catch {
      if (job === this.generation && !this.disposed)
        this.publish({
          status: 'error',
          countInRemainingMs: 0,
          error: '카운트인을 시작할 수 없습니다.',
        });
    }
  }
  dispose() {
    this.pause();
    this.disposed = true;
    this.metronomeRequest++;
    window.clearTimeout(this.loadTimer);
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.publish({
      status: 'empty',
      audioTimeMs: 0,
      durationMs: 0,
      loop: null,
      metronomeEnabled: false,
      error: null,
    });
    if (this.context) {
      void this.context
        .close()
        .catch(() => logDiagnostic('warn', 'AUDIO_CONTEXT_CLOSE_FAILED'));
      this.context = null;
    }
  }
}
