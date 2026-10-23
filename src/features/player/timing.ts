import type { ScoreDocument, SyncAnchor } from '../../entities/score';
import { audioTimeToScoreTick, scoreTickToAudioTime } from './sync';
export type Timing = {
  bpm: number;
  numerator: number;
  denominator: number;
  beatOriginMs?: number;
};
export function validateTiming(timing: Timing) {
  if (
    (timing.beatOriginMs !== undefined &&
      !Number.isFinite(timing.beatOriginMs)) ||
    !Number.isFinite(timing.bpm) ||
    timing.bpm < 10 ||
    timing.bpm > 600 ||
    !Number.isInteger(timing.numerator) ||
    timing.numerator < 1 ||
    timing.numerator > 32 ||
    ![1, 2, 4, 8, 16, 32].includes(timing.denominator)
  )
    throw new Error('지원 범위 안의 템포와 박자를 지정하세요.');
}
export function timingAt(document: ScoreDocument, audioTimeMs: number): Timing {
  const tick = Math.max(
    0,
    audioTimeToScoreTick(document.syncAnchors, audioTimeMs),
  );
  const signature = [...document.timeSignatures]
    .reverse()
    .find((point) => point.tick <= tick) ?? {
    tick: 0,
    numerator: 4,
    denominator: 4,
  };
  const bpm = tempoFromAnchors(document.syncAnchors, tick, document.ppq);
  return {
    beatOriginMs: scoreTickToAudioTime(document.syncAnchors, signature.tick),
    bpm,
    numerator: signature.numerator,
    denominator: signature.denominator,
  };
}
export function tempoFromAnchors(
  anchors: SyncAnchor[],
  tick: number,
  ppq: number,
) {
  const end = anchors.findIndex((point) => point.scoreTick > tick);
  const index = end < 0 ? anchors.length - 2 : Math.max(0, end - 1);
  const a = anchors[index];
  const b = anchors[index + 1];
  if (!a || !b) throw new Error('싱크 앵커를 확인하세요.');
  return (
    (60000 * (b.scoreTick - a.scoreTick)) /
    (ppq * (b.audioTimeMs - a.audioTimeMs))
  );
}
export function countInSeconds(bars: number, timing: Timing, rate: number) {
  validateTiming(timing);
  if (
    !Number.isInteger(bars) ||
    bars < 0 ||
    bars > 2 ||
    !Number.isFinite(rate) ||
    rate < 0.5 ||
    rate > 1.5
  )
    throw new Error('카운트인 설정이 잘못되었습니다.');
  return (
    (bars * timing.numerator * (4 / timing.denominator) * 60) /
    (timing.bpm * rate)
  );
}
