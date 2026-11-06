// docs/12 "하단 믹서 실시간 레벨 미터": 재생 경로는 그대로 두고 captureStream으로 엿듣습니다.

/** 샘플마다 (신호 × 음량)을 더한 합의 최대 절댓값. 창 길이가 다르면 짧은 쪽에 맞춥니다. */
export function mixPeak(frames: Float32Array[], gains: number[]): number {
  if (frames.length === 0) return 0;
  const length = Math.min(...frames.map((f) => f.length));
  let peak = 0;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let k = 0; k < frames.length; k++)
      sum += (frames[k]?.[i] ?? 0) * (gains[k] ?? 0);
    peak = Math.max(peak, Math.abs(sum));
  }
  return peak;
}

type Capturable = HTMLMediaElement & { captureStream?: () => MediaStream };
type Tap = { stream: MediaStream; analyser: AnalyserNode | null };

export class LiveLevel {
  private context: AudioContext | null = null;
  private taps = new Map<HTMLMediaElement, Tap>();

  /** 지금 재생 중인 요소들의 마스터 레벨. 측정할 수 없으면 null입니다. */
  read(elements: HTMLMediaElement[]): number | null {
    if (typeof AudioContext === 'undefined') return null;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
    // 다시 준비한 믹스처럼 목록에서 빠진 요소는 엿듣기를 멈춥니다.
    for (const [element, tap] of this.taps)
      if (!elements.includes(element)) {
        for (const track of tap.stream.getTracks()) track.stop();
        this.taps.delete(element);
      }
    const frames: Float32Array[] = [];
    const gains: number[] = [];
    for (const element of elements) {
      if (element.paused || element.muted || element.volume === 0) continue;
      const analyser = this.tap(element);
      if (analyser === undefined) return null;
      if (!analyser) continue;
      const frame = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(frame);
      frames.push(frame);
      gains.push(element.volume);
    }
    return mixPeak(frames, gains);
  }

  /** undefined: 이 환경은 엿들을 수 없음, null: 소리 트랙이 아직 없음 */
  private tap(element: HTMLMediaElement): AnalyserNode | null | undefined {
    const capture = (element as Capturable).captureStream;
    if (!capture || !this.context) return undefined;
    let tap = this.taps.get(element);
    if (!tap) {
      tap = { stream: capture.call(element), analyser: null };
      this.taps.set(element, tap);
    }
    // 소리 트랙은 요소가 음원을 읽은 뒤에 생기므로, 생길 때까지 연결을 미룹니다.
    if (!tap.analyser && tap.stream.getAudioTracks().length > 0) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 2048;
      this.context.createMediaStreamSource(tap.stream).connect(analyser);
      tap.analyser = analyser;
    }
    return tap.analyser;
  }

  close() {
    for (const tap of this.taps.values())
      for (const track of tap.stream.getTracks()) track.stop();
    this.taps.clear();
    void this.context?.close();
    this.context = null;
  }
}
