import type { SyncAnchor } from '../../entities/score';
export function validateAnchors(anchors: SyncAnchor[]): void {
  if (anchors.length < 2) throw new Error('싱크 앵커를 2개 이상 지정하세요.');
  anchors.forEach((anchor, index) => {
    const previous = anchors[index - 1];
    if (
      !Number.isFinite(anchor.scoreTick) ||
      !Number.isInteger(anchor.scoreTick) ||
      anchor.scoreTick < 0 ||
      !Number.isFinite(anchor.audioTimeMs) ||
      anchor.audioTimeMs < 0 ||
      (previous &&
        (previous.scoreTick >= anchor.scoreTick ||
          previous.audioTimeMs >= anchor.audioTimeMs))
    )
      throw new Error('앵커의 악보 tick과 음원 시간은 모두 증가해야 합니다.');
  });
}
function interpolate(
  anchors: SyncAnchor[],
  value: number,
  inverse: boolean,
): number {
  validateAnchors(anchors);
  if (!Number.isFinite(value)) throw new Error('유효한 시간을 입력하세요.');
  const x = (a: SyncAnchor) => (inverse ? a.audioTimeMs : a.scoreTick);
  const y = (a: SyncAnchor) => (inverse ? a.scoreTick : a.audioTimeMs);
  const endIndex = anchors.findIndex((a) => x(a) > value);
  const index = endIndex < 0 ? anchors.length - 2 : Math.max(0, endIndex - 1);
  const left = anchors[index];
  const right = anchors[index + 1];
  if (!left || !right) throw new Error('싱크 앵커가 부족합니다.');
  return (
    y(left) + ((value - x(left)) * (y(right) - y(left))) / (x(right) - x(left))
  );
}
export function scoreTickToAudioTime(anchors: SyncAnchor[], tick: number) {
  return interpolate(anchors, tick, false);
}
/** 여러 tick을 앵커 한 번 검사 + 이진 탐색으로 바꿉니다. 결과는 scoreTickToAudioTime과 같습니다(docs/12). */
export function scoreTicksToAudioTimes(
  anchors: SyncAnchor[],
  ticks: number[],
): number[] {
  validateAnchors(anchors);
  return ticks.map((tick) => {
    if (!Number.isFinite(tick)) throw new Error('유효한 시간을 입력하세요.');
    // 처음으로 tick보다 큰 앵커(없으면 길이)를 찾고, 그 앞 구간을 씁니다.
    let low = 0;
    let high = anchors.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (anchors[middle]!.scoreTick > tick) high = middle;
      else low = middle + 1;
    }
    const index =
      low === anchors.length ? anchors.length - 2 : Math.max(0, low - 1);
    const left = anchors[index]!;
    const right = anchors[index + 1]!;
    return (
      left.audioTimeMs +
      ((tick - left.scoreTick) * (right.audioTimeMs - left.audioTimeMs)) /
        (right.scoreTick - left.scoreTick)
    );
  });
}
export function audioTimeToScoreTick(anchors: SyncAnchor[], audioMs: number) {
  return interpolate(anchors, audioMs, true);
}
export function validateLoop(
  startMs: number,
  endMs: number,
  durationMs: number,
) {
  if (
    ![startMs, endMs, durationMs].every(Number.isFinite) ||
    startMs < 0 ||
    endMs - startMs < 250 ||
    endMs > durationMs
  )
    throw new Error('반복 구간은 음원 안의 250ms 이상 범위여야 합니다.');
}
