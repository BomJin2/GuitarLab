import type { PlayerEngine, PlayerSnapshot } from '../player/PlayerEngine';
import type { RecordedTake } from '../recordings/recordings';
import { decodeMix, layerVolume, type MixDocument } from './mixing';
import {
  monitorPlaybackMessage,
  playbackErrorCode,
  type MonitorPlaybackApi,
} from './monitorPlayback';
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
    }
  | {
      /** docs/12 "Bounce to New Track v1": 원본 테이크(source)의 시간축을 따릅니다. */
      kind: 'RENDER';
      stemId: string;
      projectId: string;
      bytes: ArrayBuffer;
      source: RecordedTake;
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
  // docs/12 "모니터 테이크 재생 v1": AmpliTube 모니터로 보내는 TAKE 레이어 하나.
  private wetId: string | null = null;
  private wetSent: { playing: boolean; timeMs: number; at: number } | null =
    null;
  private wetCheckAt = 0;
  private wetQueue: Promise<unknown> = Promise.resolve();
  /** 마지막 AmpliTube 테이크 선택 번호. 늦게 끝난 이전 선택이 최신 선택을 덮지 않게 합니다. */
  private wetSelect = 0;
  /** 아직 끝나지 않은 AmpliTube 테이크 불러오기가 있는지(해제 때 같이 취소). */
  private wetPending = false;
  constructor(
    private main: PlayerEngine,
    private onError: (message: string) => void,
    private wet: MonitorPlaybackApi | null = null,
    private onWet: (
      takeId: string | null,
      message: string | null,
    ) => void = () => {},
  ) {}
  wetTakeId() {
    return this.wetId;
  }
  /** 실패하면 원음 재생을 유지하고 오류 코드를 던집니다. */
  async setWet(takeId: string | null) {
    const projectId = this.mix?.projectId;
    if (!this.wet || !projectId) throw new Error('MIX_CONTRACT_INVALID');
    if (takeId === null) {
      this.dropWet(null);
      return;
    }
    if (
      !this.voices.some(
        (voice) => voice.id === takeId && voice.take?.id === takeId,
      )
    )
      throw new Error('MIX_CONTRACT_INVALID');
    const select = ++this.wetSelect;
    // 불러오기·해제를 같은 줄에 세워 Rust가 받는 순서를 선택 순서와 같게 합니다.
    const wet = this.wet;
    const job = this.wetQueue.then(() => wet.load(projectId, takeId));
    this.wetQueue = job.catch(() => {});
    this.wetPending = true;
    try {
      await job;
    } finally {
      if (select === this.wetSelect) this.wetPending = false;
    }
    if (select !== this.wetSelect) return;
    if (this.mix?.projectId !== projectId) {
      void wet.load(projectId, null).catch(() => {});
      return;
    }
    this.wetId = takeId;
    this.wetSent = null;
    this.onWet(takeId, null);
    this.sync();
  }
  private dropWet(message: string | null, resync = true) {
    const projectId = this.mix?.projectId;
    const had = this.wetId !== null;
    this.wetSelect++;
    this.wetPending = false;
    this.wetId = null;
    this.wetSent = null;
    if (this.wet && projectId)
      this.wetQueue = this.wetQueue
        .then(() => this.wet?.load(projectId, null))
        .catch(() => {});
    if (had || message) this.onWet(null, message);
    if (resync) this.sync();
  }
  private sendWet(playing: boolean, timeMs: number, now: number) {
    const id = this.wetId;
    this.wetSent = { playing, timeMs, at: now };
    this.wetCheckAt = now;
    this.wetQueue = this.wetQueue
      .then(() => this.wet?.set(playing, Math.min(timeMs, 600000)))
      .catch((cause: unknown) => {
        if (this.wetId === id && !this.disposed)
          this.dropWet(monitorPlaybackMessage(playbackErrorCode(cause)));
      });
  }
  private syncWet(
    voice: Voice,
    timeMs: number,
    rate: number,
    volume: number,
    state: PlayerSnapshot,
    jumped: boolean,
  ) {
    if (!voice.media.paused) voice.media.pause();
    if (Math.abs(rate - 1) > 0.000001) {
      this.dropWet(
        '재생 속도가 1배가 아니어서 이 레이어를 원음 재생으로 바꿨습니다(AmpliTube 재생은 1배만).',
      );
      return;
    }
    // 레이어 gain은 AmpliTube 앞 크기라 톤을 바꾸므로 적용하지 않고 0일 때만 멈춥니다.
    const playing =
      state.status === 'playing' &&
      volume > 0 &&
      timeMs >= 0 &&
      timeMs < voice.media.duration * 1000;
    const now = performance.now();
    const sent = this.wetSent;
    if (!sent || sent.playing !== playing || (playing && jumped)) {
      this.sendWet(playing, Math.max(0, timeMs), now);
      return;
    }
    if (!playing || now - this.wetCheckAt < 2000) return;
    this.wetCheckAt = now;
    const id = this.wetId;
    this.wetQueue = this.wetQueue
      .then(() => this.wet?.status())
      .then((status) => {
        // 응답을 기다리는 동안 일시정지·탐색 등 새 명령을 보냈다면 늦은 응답으로 다시 재생하지 않습니다.
        if (
          !status ||
          this.wetId !== id ||
          this.disposed ||
          this.wetSent !== sent ||
          !sent.playing ||
          this.main.getSnapshot().status !== 'playing'
        )
          return;
        const expected = timeMs + (performance.now() - now);
        // 클립 위치가 반주보다 50ms 넘게 벌어졌을 때만 다시 맞춥니다(맞출 때 잠깐 튐).
        if (
          status.positionMs === null ||
          Math.abs(status.positionMs - expected) > 50
        )
          this.sendWet(true, expected, performance.now());
      })
      .catch(() => {});
  }
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
              ('source' in entry && entry.source.projectId !== mix.projectId) ||
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
          take:
            'take' in entry
              ? entry.take
              : 'source' in entry
                ? entry.source
                : null,
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
  /** docs/12 "실시간 레벨 미터": 반주와 믹스 레이어의 재생 요소(음량은 각 요소에 이미 적용됨) */
  mediaElements(): HTMLMediaElement[] {
    return [this.main.audio, ...this.voices.map((voice) => voice.media)];
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
    if (this.wetId && !this.mix.layers.some((l) => l.id === this.wetId))
      this.dropWet(null, false);
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
    if (voice.id === this.wetId) {
      this.syncWet(voice, time, rate, volume, state, changed || offsetChanged);
      return;
    }
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
    // 불러오는 중인 선택도 무효화하고 Rust 클립 해제를 같은 줄에 넣습니다.
    if (this.wetId || this.wetPending) this.dropWet(null, false);
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
