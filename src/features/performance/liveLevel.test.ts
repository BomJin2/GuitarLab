import { expect, it } from 'vitest';
import { mixPeak } from './liveLevel';

it('샘플마다 신호 × 음량을 더한 합의 최대 절댓값을 쓴다', () => {
  const a = new Float32Array([0.5, -0.5, 0.25]);
  const b = new Float32Array([0.5, 0.5, -1]);
  // 같은 순간에 겹친 값만 커지고, 반대 위상은 상쇄됩니다.
  expect(mixPeak([a, b], [1, 1])).toBeCloseTo(1);
  expect(mixPeak([a, b], [0.5, 1])).toBeCloseTo(0.875);
  expect(mixPeak([a, b], [1, 0])).toBeCloseTo(0.5);
  // 길이가 다르면 짧은 창까지만 봅니다.
  expect(mixPeak([a, new Float32Array([1])], [1, 1])).toBeCloseTo(1.5);
  expect(mixPeak([], [])).toBe(0);
});
