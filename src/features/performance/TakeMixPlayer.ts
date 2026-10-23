import type { PlayerEngine, PlayerSnapshot } from '../player/PlayerEngine';
import type { RecordedTake } from '../recordings/recordings';
import { decodeMix, layerVolume, type MixDocument } from './mixing';
type Voice = {
  take: RecordedTake | null;
  id: string;
  media: HTMLAudioElement;
  url: string;
  pending: boolean;
  offsetMs: number | null;
  driftSinceMs: number | null;
  lastSeekMs: number;
};
export type MixPlaybackEntry =
  | { take: RecordedTake; bytes: ArrayBuffer }
  | {
      kind: 'STEM' | 'IMPORTED_STEM';
      stemId: string;
      projectId: string;
      bytes: ArrayBuffer;
    };
export function takeTimeMs(
  take: RecordedTake,
  songMs: number,
  offsetMs: number,
) {
  return (
    (songMs - (take.songStartMs ?? 0) - take.alignmentOffsetMs - offsetMs) /
    (take.transport?.rate ?? 1)
  );
}
// 기준 반주의 논리 시각을 따릅니다. WebView 다중 media의 샘플 단위 동기는 보장하지 않습니다.
export class TakeMixPlayer {
  private voices: Voice[] = [];
  private unsubscribe: (() => void) | null = null;
  private mix: MixDocument | null = null;
  private originalVolume = 1;
  private disposed = false;
  private epoch = -1;
  constructor(
    private main: PlayerEngine,
    private onError: (message: string) => void,
  ) {}
  async prepare(
    mix: MixDocument,
    entries: MixPlaybackEntry[],
    signal: AbortSignal,
  ) {
    this.clear();
    this.disposed = false;
    try {
      decodeMix(mix);
      if (
        entries.length > 8 ||
        entries.filter((entry) => 'take' in entry).length > 7 ||
        new Set(
          entries.map((entry) =>
            'take' in entry ? entry.take.id : entry.stemId,
          ),
        ).size !== entries.length ||
        mix.layers.filter((layer) => layer.kind !== 'LOCAL_ASSET').length !==
          entries.length ||
        entries.some((entry) =>
          'take' in entry
            ? entry.take.projectId !== mix.projectId ||
              entry.take.state !== 'READY' ||
              !mix.layers.some(
                (l) => l.kind === 'TAKE' && l.id === entry.take.id,
              )
            : entry.projectId !== mix.projectId ||
              !mix.layers.some(
                (l) => l.kind === entry.kind && l.id === entry.stemId,
              ),
        )
      )
        throw new Error('MIX_CONTRACT_INVALID');
      for (const entry of entries) {
        if (signal.aborted) throw new DOMException('믹스 취소', 'AbortError');
        const media = new Audio();
        media.preservesPitch = true;
        const url = URL.createObjectURL(
          new Blob([entry.bytes], { type: 'audio/wav' }),
        );
        const voice: Voice = {
          take: 'take' in entry ? entry.take : null,
          id: 'take' in entry ? entry.take.id : entry.stemId,
          media,
          url,
          pending: false,
          offsetMs: null,
          driftSinceMs: null,
          lastSeekMs: -Infinity,
        };
        this.voices.push(voice);
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            window.clearTimeout(timer);
            media.removeEventListener('loadedmetadata', ready);
            media.removeEventListener('error', failed);
            signal.removeEventListener('abort', abort);
            if (error) reject(error);
            else resolve();
          };
          const ready = () =>
            Number.isFinite(media.duration) && media.duration > 0
              ? finish()
              : finish(new Error('믹스 음원 길이를 읽지 못했습니다.'));
          const failed = () =>
            finish(new Error('믹스 참조 음원을 읽지 못했습니다.'));
          const abort = () =>
            finish(new DOMException('믹스 취소', 'AbortError'));
          const timer = window.setTimeout(failed, 15000);
          media.addEventListener('loadedmetadata', ready);
          media.addEventListener('error', failed);
          signal.addEventListener('abort', abort, { once: true });
          media.src = url;
          media.load();
        });
        media.addEventListener('error', this.fail);
      }
      if (signal.aborted) throw new DOMException('믹스 취소', 'AbortError');
      this.originalVolume = this.main.getSnapshot().volume;
      this.mix = decodeMix(mix);
      this.unsubscribe = this.main.subscribe(() => this.sync());
      this.sync();
    } catch (cause) {
      this.clear();
      throw cause;
    }
  }
  update(mix: MixDocument) {
    this.mix = decodeMix(mix);
    this.sync();
  }
  private fail = () => {
    if (this.disposed) return;
    this.clear();
    this.main.pause();
    this.onError(
      '믹스 참조 음원 재생이 중단됐습니다. 반주를 멈췄으니 녹음 상태를 확인하세요.',
    );
  };
  private sync() {
    if (!this.mix || this.disposed) return;
    const state = this.main.getSnapshot();
    const backing = this.mix.layers.find((l) => l.kind === 'LOCAL_ASSET');
    const volume = backing ? layerVolume(this.mix, backing) : 0;
    if (Math.abs(state.volume - volume) > 0.000001) this.main.setVolume(volume);
    const changed = state.playbackEpoch !== this.epoch;
    this.epoch = state.playbackEpoch;
    for (const voice of this.voices) this.syncVoice(voice, state, changed);
  }
  private syncVoice(voice: Voice, state: PlayerSnapshot, changed: boolean) {
    const layer = this.mix?.layers.find((l) => l.id === voice.id);
    if (!this.mix || !layer) {
      voice.media.pause();
      return;
    }
    const time = voice.take
      ? takeTimeMs(voice.take, state.audioTimeMs, layer.offsetMs)
      : state.audioTimeMs - layer.offsetMs;
    const volume = layerVolume(this.mix, layer);
    const rate = state.rate / (voice.take?.transport?.rate ?? 1);
    if (voice.media.volume !== volume) voice.media.volume = volume;
    if (voice.media.playbackRate !== rate) voice.media.playbackRate = rate;
    const offsetChanged = voice.offsetMs !== layer.offsetMs;
    voice.offsetMs = layer.offsetMs;
    const now = performance.now();
    if (
      time < 0 ||
      time >= voice.media.duration * 1000 ||
      state.status !== 'playing'
    ) {
      if (!voice.media.paused) voice.media.pause();
      voice.driftSinceMs = null;
      if (
        time >= 0 &&
        time <= voice.media.duration * 1000 &&
        (changed || offsetChanged)
      )
        this.seekVoice(voice, time, now);
      return;
    }
    if (changed || offsetChanged || (voice.media.paused && !voice.pending)) {
      this.seekVoice(voice, time, now);
    } else if (
      voice.pending ||
      voice.media.seeking ||
      now - voice.lastSeekMs < 1000
    ) {
      voice.driftSinceMs = null;
    } else if (Math.abs(voice.media.currentTime * 1000 - time) / rate > 160) {
      // 짧은 media 시각 차이를 즉시 탐색으로 보정해 청취를 끊지 않도록 합니다.
      voice.driftSinceMs ??= now;
      if (now - voice.driftSinceMs >= 500) this.seekVoice(voice, time, now);
    } else {
      voice.driftSinceMs = null;
    }
    if (voice.media.paused && !voice.pending) {
      voice.pending = true;
      void voice.media
        .play()
        .then(() => {
          if (
            this.disposed ||
            !this.voices.includes(voice) ||
            this.main.getSnapshot().status !== 'playing'
          )
            voice.media.pause();
        })
        .catch(() => {
          if (!this.disposed && this.voices.includes(voice)) this.fail();
        })
        .finally(() => {
          voice.pending = false;
        });
    }
  }
  private seekVoice(voice: Voice, timeMs: number, now: number) {
    if (Math.abs(voice.media.currentTime * 1000 - timeMs) > 1)
      voice.media.currentTime = timeMs / 1000;
    voice.lastSeekMs = now;
    voice.driftSinceMs = null;
  }
  clear() {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    const hadMix = this.mix !== null;
    this.mix = null;
    for (const voice of this.voices) {
      voice.media.removeEventListener('error', this.fail);
      voice.media.pause();
      voice.media.removeAttribute('src');
      voice.media.load();
      URL.revokeObjectURL(voice.url);
    }
    this.voices = [];
    this.epoch = -1;
    if (hadMix) this.main.setVolume(this.originalVolume);
  }
}
