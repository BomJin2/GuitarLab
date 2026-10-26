import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRevisionScorePreview } from './useRevisionScorePreview';
import { projectFixture } from '../../test/projectFixture';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import * as notation from '../score/normalizedNotation';

afterEach(() => vi.restoreAllMocks());

function revisionFixture() {
  const revision = projectFixture().revision;
  if (!revision) throw new Error('자체 악보 누락');
  const session = scoreEditingFixture();
  revision.score = { ...session.document, renderSource: 'NORMALIZED' };
  return { revision, session };
}

it('명시적 준비만 독립 Score를 만들고 닫기·새 문맥은 원본/재생 없이 초기화한다', () => {
  const { revision, session } = revisionFixture();
  const before = JSON.stringify(revision);
  const bytes = Array.from(session.originalBytes);
  const render = vi.spyOn(notation, 'renderNormalized');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const hook = renderHook(({ source }) => useRevisionScorePreview(source), {
    initialProps: { source: revision },
  });
  expect(render).not.toHaveBeenCalled();
  expect(hook.result.current.open).toBe(false);
  act(() => hook.result.current.show());
  const rendered = hook.result.current.value;
  expect(rendered).not.toBeNull();
  expect(rendered?.score === session.score).toBe(false);
  expect(rendered?.playbackLookup === session.playbackLookup).toBe(false);
  expect(
    rendered?.score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0]
      ?.fret,
  ).toBe(revision.score.tracks[0]?.notes[0]?.fret);
  hook.rerender({ source: revision });
  expect(render).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.hide());
  expect(hook.result.current.value).toBeNull();
  expect(hook.result.current.open).toBe(false);
  act(() => hook.result.current.show());
  const other = {
    ...revision,
    revisionId: '00000000-0000-4000-8000-000000000099',
  };
  hook.rerender({ source: other });
  expect(hook.result.current.value).toBeNull();
  expect(hook.result.current.error).toBeNull();
  hook.rerender({ source: revision });
  expect(hook.result.current.open).toBe(false);
  expect(play).not.toHaveBeenCalled();
  expect(JSON.stringify(revision)).toBe(before);
  expect(Array.from(session.originalBytes)).toEqual(bytes);
});

it('원본 기반은 준비하지 않고 의미 불일치 실패는 문서 보존·문맥 교체 후 초기화한다', () => {
  const { revision } = revisionFixture();
  const { renderSource, ...originalScore } = revision.score;
  expect(renderSource).toBe('NORMALIZED');
  const original: typeof revision = {
    ...revision,
    score: originalScore,
  };
  const render = vi.spyOn(notation, 'renderNormalized');
  const hook = renderHook(({ source }) => useRevisionScorePreview(source), {
    initialProps: { source: original },
  });
  act(() => hook.result.current.show());
  expect(hook.result.current.eligible).toBe(false);
  expect(render).not.toHaveBeenCalled();
  const broken = structuredClone(revision);
  const first = broken.score.tracks[0]?.notes[0];
  if (!first) throw new Error('자체 음표 누락');
  first.pitchMidi += 1;
  const before = JSON.stringify(broken);
  hook.rerender({ source: broken });
  act(() => hook.result.current.show());
  expect(hook.result.current.value).toBeNull();
  expect(hook.result.current.error).toContain('아래 표와 원본은 유지');
  expect(JSON.stringify(broken)).toBe(before);
  hook.rerender({ source: revision });
  expect(hook.result.current.open).toBe(false);
  expect(hook.result.current.error).toBeNull();
  act(() => hook.result.current.show());
  expect(hook.result.current.value).not.toBeNull();
});
