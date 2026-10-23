import { expect, it } from 'vitest';
import { scoreEditingFixture } from '../test/scoreEditingFixture';
import { ScoreDirtyTracker } from './scoreDirty';

it('불러오기는 깨끗하고 편집·되돌리기·재실행은 저장 문서와 비교한다', () => {
  const tracker = new ScoreDirtyTracker();
  const loaded = scoreEditingFixture();
  const edited = { ...loaded, document: { ...loaded.document, title: '변경' } };
  expect(tracker.observe(null)).toBe(false);
  expect(tracker.observe(loaded)).toBe(false);
  expect(tracker.observe(edited)).toBe(true);
  expect(tracker.observe(loaded)).toBe(false);
  expect(tracker.observe(edited)).toBe(true);
  const saved = {
    ...edited,
    savedRevision: {
      projectId: 'p',
      revisionId: 'r',
      document: edited.document,
    },
  };
  expect(tracker.observe(saved)).toBe(false);
  expect(tracker.observe({ ...saved, document: loaded.document })).toBe(true);
  expect(tracker.observe(saved)).toBe(false);
  expect(tracker.observe(scoreEditingFixture())).toBe(false);
});
it('원본 재열기에서 안전 metadata가 보완된 문서는 실제 저장 revision과 비교한다', () => {
  const loaded = scoreEditingFixture();
  const tracker = new ScoreDirtyTracker();
  expect(
    tracker.observe({
      ...loaded,
      savedRevision: {
        projectId: 'p',
        revisionId: 'r',
        document: { ...loaded.document },
      },
    }),
  ).toBe(true);
});
