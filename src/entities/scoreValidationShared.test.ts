import { expect, it } from 'vitest';
import shared from '../../fixtures/score-validation-v1.json';
import { decodeScoreDocument } from './scoreValidation';

// Rust storage::projects_tests의 같은 파일 검사와 짝입니다.
function apply(base: unknown, path: string | null, value: unknown) {
  const copy = structuredClone(base) as Record<string, unknown>;
  if (path === null) return copy;
  const keys = path.split('/').slice(1);
  const last = keys.pop()!;
  let target: Record<string, unknown> = copy;
  for (const key of keys) target = target[key] as Record<string, unknown>;
  target[last] = value;
  return copy;
}

it('공통 자료의 악보 변형마다 Rust와 같은 판정을 낸다', () => {
  for (const c of shared.cases) {
    const valid = (() => {
      try {
        decodeScoreDocument(apply(shared.base, c.path, c.value));
        return true;
      } catch {
        return false;
      }
    })();
    expect(valid, c.name).toBe(c.valid);
  }
});

// 짝 없는 서로게이트는 Rust serde_json이 JSON 읽기에서 거부하므로 공통 자료 파일에 넣을 수 없어 여기서 확인합니다.
it('짝 없는 서로게이트가 든 제목·ID는 Rust처럼 무효로 본다', () => {
  for (const [path, value] of [
    ['/title', '제목\ud800'],
    ['/id', 'id-\udc00'],
    ['/tracks/0/name', 'Gt\udbff'],
  ] as const)
    expect(() =>
      decodeScoreDocument(apply(shared.base, path, value)),
    ).toThrow();
});
