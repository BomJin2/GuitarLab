import { invoke } from '@tauri-apps/api/core';
import type { MixDocument } from '../performance/mixing';
import type { PlaybackLoop } from './PlayerEngine';
import { logDiagnostic } from '../../shared/logger';

/** docs/12 "네이티브 재생 v1"(재생 Rust 이전 R2): Rust 재생 버스의 transport를 `PlayerEngine`이 쓰는 형태로 감쌉니다. */
type Snapshot = {
  prepared: boolean;
  playing: boolean;
  positionMs: number;
  /** Rust 버스가 구간 끝에서 되감은 횟수(누적). */
  loopCount: number;
  errorCode: string | null;
};
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;
function decodeSnapshot(value: unknown): Snapshot {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.prepared !== 'boolean' ||
    typeof value.playing !== 'boolean' ||
    typeof value.positionMs !== 'number' ||
    !Number.isFinite(value.positionMs) ||
    value.positionMs < 0 ||
    typeof value.loopCount !== 'number' ||
    !Number.isSafeInteger(value.loopCount) ||
    value.loopCount < 0 ||
    !(value.errorCode === null || typeof value.errorCode === 'string')
  )
    throw new Error('NATIVE_CONTRACT_INVALID');
  return {
    prepared: value.prepared,
    playing: value.playing,
    positionMs: value.positionMs,
    loopCount: value.loopCount,
    errorCode: value.errorCode,
  };
}
export type NativeMetronome = {
  originMs: number;
  beatMs: number;
  numerator: number;
  volume: number;
};
export type NativeCountIn = {
  count: number;
  intervalMs: number;
  numerator: number;
  volume: number;
};
/** 재생 중 Rust 위치와 화면 추정이 이만큼 넘게 다르면 바로 맞춥니다. */
const SNAP_MS = 30;
const POLL_MS = 250;

/** 진행 중인 해제. 다음 준비는 이 해제가 끝난 뒤에 보내 늦은 해제가 새 출력을 닫지 않게 합니다. */
let releasing: Promise<unknown> = Promise.resolve();
/** 믹스 설정 변경을 보낸 순서대로 적용합니다(늦은 이전 요청이 최신 설정을 덮지 않게). */
let updating: Promise<unknown> = Promise.resolve();
export const nativePlaybackApi = {
  async prepare(
    outputDeviceId: string,
    mix: MixDocument,
    backingAssetId: string | null = null,
  ) {
    await releasing;
    const value = await invoke<unknown>('prepare_native_playback', {
      request: { schemaVersion: 1, outputDeviceId, mix, backingAssetId },
    });
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      typeof value.sampleRate !== 'number' ||
      !Number.isInteger(value.sampleRate) ||
      value.sampleRate < 8000 ||
      typeof value.durationMs !== 'number' ||
      !Number.isFinite(value.durationMs) ||
      value.durationMs < 0
    )
      throw new Error('NATIVE_CONTRACT_INVALID');
    return { sampleRate: value.sampleRate, durationMs: value.durationMs };
  },
  update: (mix: MixDocument) => {
    const job = updating.then(() =>
      invoke<void>('update_native_mix', { request: { schemaVersion: 1, mix } }),
    );
    updating = job.catch(() => undefined);
    return job;
  },
  transport: async (request: {
    playing: boolean;
    positionMs: number | null;
    volume: number;
    loop: PlaybackLoop | null;
  }) =>
    decodeSnapshot(
      await invoke<unknown>('set_native_transport', {
        request: { schemaVersion: 1, ...request },
      }),
    ),
  /** R3: 메트로놈(재생 중 박마다)과 카운트인 클릭은 Rust 출력에서 냅니다. */
  metronome: (spec: NativeMetronome | null) =>
    invoke<void>('set_native_metronome', {
      request: spec
        ? { schemaVersion: 1, enabled: true, ...spec }
        : {
            schemaVersion: 1,
            enabled: false,
            originMs: 0,
            beatMs: 500,
            numerator: 4,
            volume: 0,
          },
    }),
  countIn: (spec: NativeCountIn) =>
    invoke<void>('native_count_in', { request: { schemaVersion: 1, ...spec } }),
  /** R3 녹음 정렬: 입력 시계 값과 그 순간 장치에서 들리는 곡 위치. */
  clock: async () => {
    const value = await invoke<unknown>('get_native_clock');
    if (
      !isRecord(value) ||
      !(
        value.songTimeMs === null ||
        (typeof value.songTimeMs === 'number' &&
          Number.isFinite(value.songTimeMs) &&
          value.songTimeMs >= 0)
      )
    )
      throw new Error('NATIVE_CONTRACT_INVALID');
    return { clock: value, songTimeMs: value.songTimeMs };
  },
  read: async () =>
    decodeSnapshot(await invoke<unknown>('get_native_transport')),
  release: () => {
    const job = releasing.then(() => invoke<void>('release_native_playback'));
    releasing = job.catch(() => undefined);
    return job;
  },
};

export class NativeTransport {
  playing = false;
  private anchorMs = 0;
  private anchorAt = 0;
  private loop: PlaybackLoop | null = null;
  private volume = 1;
  private timer: number | undefined;
  private disposed = false;
  /** 위치를 새로 정할 때마다 올려, 그 전에 보낸 위치 조회의 늦은 응답을 버립니다. */
  private era = 0;
  /** 위치 조회는 하나씩만 보냅니다(응답이 역순으로 와서 위치가 되돌아가지 않게). */
  private reading = false;
  /** 기준점 시점의 Rust 되감기 횟수와 지금까지 본 최대값. */
  private anchorLoops = 0;
  private seenLoops = 0;
  /** Rust 쪽 준비가 풀렸을 때(샘플레이트 변경·출력 실패) 한 번 불립니다. */
  onLost: ((code: string) => void) | null = null;
  constructor(
    private api: typeof nativePlaybackApi,
    readonly durationMs: number,
  ) {}
  timeMs() {
    if (!this.playing) return this.anchorMs;
    const t = this.anchorMs + (performance.now() - this.anchorAt);
    const loop = this.loop;
    // Rust가 구간 끝에서 되감으므로 추정도 같이 되감습니다.
    if (loop && this.anchorMs < loop.endMs && t >= loop.endMs)
      return loop.startMs + ((t - loop.startMs) % (loop.endMs - loop.startMs));
    return t;
  }
  private anchor(ms: number) {
    this.anchorMs = ms;
    this.anchorAt = performance.now();
    this.anchorLoops = this.seenLoops;
  }
  /** 구간 반복 회차(누적). 화면 갱신이 늦어 경계를 건너뛰어도 Rust 횟수·추정 둘 중 큰 값으로 셉니다. */
  loopIteration() {
    let extra = 0;
    const loop = this.loop;
    if (this.playing && loop && this.anchorMs < loop.endMs) {
      const t = this.anchorMs + (performance.now() - this.anchorAt);
      if (t >= loop.endMs)
        extra = 1 + Math.floor((t - loop.endMs) / (loop.endMs - loop.startMs));
    }
    return Math.max(this.seenLoops, this.anchorLoops + extra);
  }
  private observe(snapshot: Snapshot) {
    this.seenLoops = Math.max(this.seenLoops, snapshot.loopCount);
  }
  private async send(positionMs: number | null) {
    if (this.disposed) return;
    const snapshot = await this.api.transport({
      playing: this.playing,
      positionMs,
      volume: this.volume,
      loop: this.loop,
    });
    this.observe(snapshot);
    if (!snapshot.prepared)
      this.lost(snapshot.errorCode ?? 'NATIVE_NOT_PREPARED');
  }
  async play(fromMs: number) {
    this.era++;
    this.anchor(fromMs);
    this.playing = true;
    this.poll();
    await this.send(fromMs);
  }
  pause() {
    this.era++;
    this.anchor(this.timeMs());
    this.playing = false;
    window.clearInterval(this.timer);
    void this.send(this.anchorMs).catch(() => this.lost('NATIVE_FAILED'));
  }
  seek(ms: number) {
    this.era++;
    this.anchor(ms);
    void this.send(ms).catch(() => this.lost('NATIVE_FAILED'));
  }
  setVolume(volume: number) {
    this.volume = volume;
    void this.send(null).catch(() => this.lost('NATIVE_FAILED'));
  }
  setLoop(loop: PlaybackLoop | null) {
    this.era++;
    this.anchor(this.timeMs());
    this.loop = loop ? { ...loop } : null;
    void this.send(null).catch(() => this.lost('NATIVE_FAILED'));
  }
  setMetronome(spec: NativeMetronome | null) {
    if (this.disposed) return;
    // 클릭 설정 실패로 재생까지 끊지는 않습니다.
    void this.api
      .metronome(spec)
      .catch(() => logDiagnostic('warn', 'NATIVE_PLAYBACK_LOST'));
  }
  countIn(spec: NativeCountIn) {
    if (this.disposed) return;
    void this.api
      .countIn(spec)
      .catch(() => logDiagnostic('warn', 'NATIVE_PLAYBACK_LOST'));
  }
  private poll() {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (this.reading) return;
      this.reading = true;
      const era = this.era;
      void this.api
        .read()
        .finally(() => {
          this.reading = false;
        })
        .then((s) => {
          // 그 사이 위치를 새로 정했으면(이동·재생·구간 변경) 이전 응답은 버립니다.
          if (this.disposed || !this.playing || era !== this.era) return;
          this.observe(s);
          if (!s.prepared)
            return this.lost(s.errorCode ?? 'NATIVE_NOT_PREPARED');
          // 출력 장치의 진행이 기준입니다. 작은 차이는 그대로 두어 화면 위치가 튀지 않게 합니다.
          if (Math.abs(s.positionMs - this.timeMs()) > SNAP_MS)
            this.anchor(s.positionMs);
        })
        .catch(() => this.lost('NATIVE_FAILED'));
    }, POLL_MS);
  }
  private lost(code: string) {
    if (this.disposed) return;
    logDiagnostic('warn', 'NATIVE_PLAYBACK_LOST');
    const callback = this.onLost;
    this.onLost = null;
    callback?.(code);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.playing = false;
    window.clearInterval(this.timer);
    void this.api
      .release()
      .catch(() => logDiagnostic('warn', 'NATIVE_RELEASE_FAILED'));
  }
}
