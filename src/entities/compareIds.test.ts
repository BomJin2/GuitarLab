import { expect, it } from 'vitest';
import { compareIds } from './score';
// 코드 포인트 배열을 직접 비교하는 기준 구현과 모든 쌍의 부호가 같아야 합니다(Rust String 비교와 같은 순서).
it('compareIds는 대소문자·전각·이모지·접두어에서 코드 포인트 순서를 따른다', () => {
  const pool = [
    'a',
    'B',
    'chord-a',
    'Chord-Z',
    'chord-Ａ',
    'chord-\u{1F3B8}',
    '\u{10000}',
    '￿',
    '',
    'ab',
    'a\u{1F3B8}',
    'a￿',
    '',
  ];
  const ref = (x: string, y: string) => {
    const p = [...x].map((c) => c.codePointAt(0)!);
    const q = [...y].map((c) => c.codePointAt(0)!);
    for (let i = 0; i < Math.min(p.length, q.length); i++)
      if (p[i] !== q[i]) return p[i]! - q[i]!;
    return p.length - q.length;
  };
  for (const x of pool)
    for (const y of pool)
      expect(Math.sign(compareIds(x, y)), `${x}|${y}`).toBe(
        Math.sign(ref(x, y)),
      );
});
