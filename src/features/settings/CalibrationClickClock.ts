import type { MediaClock } from '../player/captureClock';

export const calibrationBeatOriginMs = 1000;
export const calibrationBeatDurationMs = 750;
export const calibrationBeatCount = 16;
export type CalibrationSignalMode = 'PLUCK' | 'CABLE';

export class CalibrationClickClock {
  private context: AudioContext | null = null;
  private origin = 0;
  private generation = 0;
  private clicks = new Set<OscillatorNode>();

  async start(mode: CalibrationSignalMode = 'PLUCK') {
    if (this.context) throw new Error('MEASUREMENT_ACTIVE');
    const generation = ++this.generation;
    const context = new AudioContext();
    this.context = context;
    try {
      await context.resume();
      if (generation !== this.generation || context.state !== 'running')
        throw new Error('CANCELED');
      this.origin = context.currentTime;
      for (let index = 0; index < calibrationBeatCount; index++) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = index % 4 === 0 ? 1200 : 800;
        const scheduled =
          this.origin +
          (calibrationBeatOriginMs + index * calibrationBeatDurationMs) / 1000;
        if (mode === 'CABLE') {
          gain.gain.setValueAtTime(0.001, scheduled);
          gain.gain.exponentialRampToValueAtTime(0.15, scheduled + 0.002);
          gain.gain.setValueAtTime(0.15, scheduled + 0.18);
          gain.gain.exponentialRampToValueAtTime(0.001, scheduled + 0.2);
        } else {
          gain.gain.setValueAtTime(0.15, scheduled);
          gain.gain.exponentialRampToValueAtTime(0.001, scheduled + 0.035);
        }
        oscillator.connect(gain);
        gain.connect(context.destination);
        this.clicks.add(oscillator);
        oscillator.onended = () => {
          this.clicks.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(scheduled);
        oscillator.stop(scheduled + (mode === 'CABLE' ? 0.2 : 0.04));
      }
    } catch (error) {
      if (this.context === context) await this.stop();
      else if (context.state !== 'closed') await context.close();
      throw error;
    }
  }
  readClock(playbackEpoch: number): MediaClock {
    const context = this.context;
    return {
      performanceTimeMs: performance.now(),
      songTimeMs: context
        ? Math.max(0, (context.currentTime - this.origin) * 1000)
        : 0,
      rate: 1,
      playbackEpoch,
      playing: context?.state === 'running',
    };
  }
  async stop() {
    this.generation++;
    const context = this.context;
    this.context = null;
    for (const click of this.clicks) click.stop();
    this.clicks.clear();
    if (context && context.state !== 'closed') await context.close();
  }
}
