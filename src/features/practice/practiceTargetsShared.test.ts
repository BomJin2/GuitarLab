import { expect, it } from 'vitest';
import shared from '../../../fixtures/practice-targets-v1.json';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import { buildPracticeTargets } from './practice';

// Rust storage::projects_tests의 같은 파일 검사와 짝입니다. 한쪽만 규칙을 바꾸면 둘 중 하나가 실패합니다.
it('공통 자료의 악보에서 기대한 채점 목표 시각을 만든다', () => {
  const document = decodeScoreDocument(shared.score);
  const targets = buildPracticeTargets(
    document,
    shared.trackIndex,
    shared.rangeEndMs,
    null,
  );
  expect(targets.map((t) => t.id)).toEqual(shared.targets.map((t) => t.id));
  targets.forEach((target, index) => {
    const expected = shared.targets[index]!;
    expect(target.songTimeMs).toBeCloseTo(expected.songTimeMs, 6);
    expect(target.pitchMidi).toBe(expected.pitchMidi);
    expect(target.unsupported ?? false).toBe(
      'unsupported' in expected ? expected.unsupported : false,
    );
  });
});
