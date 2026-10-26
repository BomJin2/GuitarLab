import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRevisionScorePreview } from './useRevisionScorePreview';
import { projectFixture } from '../../test/projectFixture';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import * as notation from '../score/normalizedNotation';
import { projectApi } from './projects';

afterEach(() => vi.restoreAllMocks());

function revisionFixture(normalized = true) {
  const revision = projectFixture().revision;
  if (!revision) throw new Error('자체 악보 누락');
  const session = scoreEditingFixture();
  revision.score = normalized
    ? { ...session.document, renderSource: 'NORMALIZED' }
    : session.document;
  return { revision, session };
}

it('명시적 준비만 독립 Score를 만들고 닫기·새 문맥은 원본/재생 없이 초기화한다', () => {
  const { revision, session } = revisionFixture();
  const before = JSON.stringify(revision);
  const bytes = Array.from(session.originalBytes);
  const render = vi.spyOn(notation, 'renderNormalized');
  const read = vi.spyOn(projectApi, 'read');
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
  expect(read).not.toHaveBeenCalled();
  expect(JSON.stringify(revision)).toBe(before);
  expect(Array.from(session.originalBytes)).toEqual(bytes);
});

it('원본 TAB는 명시적 읽기·실제 파서로 준비하고 원본/문서·재생을 보존한다', async () => {
  vi.spyOn(projectApi, 'available').mockReturnValue(true);
  const { revision, session } = revisionFixture(false);
  const before = JSON.stringify(revision);
  const bytes = Array.from(session.originalBytes);
  let complete: (() => void) | undefined;
  const read = vi
    .spyOn(projectApi, 'read')
    .mockImplementationOnce(async (_projectId, _assetId, _signal, progress) => {
      progress({
        schemaVersion: 1,
        jobId: revision.revisionId,
        state: 'RUNNING',
        completedBytes: 20,
        totalBytes: 100,
        result: null,
        errorCode: null,
      });
      return new Promise((resolve) => {
        complete = () =>
          resolve({
            name: 'standard.musicxml',
            data: Uint8Array.from(session.originalBytes).buffer,
          });
      });
    });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const hook = renderHook(() => useRevisionScorePreview(revision));
  expect(read).not.toHaveBeenCalled();
  act(() => hook.result.current.show());
  act(() => hook.result.current.show());
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(
    revision.projectId,
    revision.scoreAssetId,
    expect.any(AbortSignal),
    expect.any(Function),
    { waitForCancellation: true },
  );
  expect(hook.result.current.busy).toBe(true);
  expect(hook.result.current.job?.completedBytes).toBe(20);
  await act(async () => complete?.());
  const rendered = hook.result.current.value;
  expect(rendered?.score === session.score).toBe(false);
  expect(rendered?.playbackLookup === session.playbackLookup).toBe(false);
  expect(
    rendered?.score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0]
      ?.fret,
  ).toBe(0);
  expect(hook.result.current.busy).toBe(false);
  expect(play).not.toHaveBeenCalled();
  expect(JSON.stringify(revision)).toBe(before);
  expect(Array.from(session.originalBytes)).toEqual(bytes);
  act(() => hook.result.current.hide());
  expect(hook.result.current.value).toBeNull();
});

it('닫기·문맥 이탈·unmount는 원본 읽기를 취소하고 실제 종료 전 중복/늦은 적용을 막는다', async () => {
  vi.spyOn(projectApi, 'available').mockReturnValue(true);
  const { revision, session } = revisionFixture(false);
  let complete: (() => void) | undefined;
  const read = vi.spyOn(projectApi, 'read').mockImplementation(
    async () =>
      new Promise((resolve) => {
        complete = () =>
          resolve({
            name: 'standard.musicxml',
            data: Uint8Array.from(session.originalBytes).buffer,
          });
      }),
  );
  const hook = renderHook(({ source }) => useRevisionScorePreview(source), {
    initialProps: { source: revision },
  });
  act(() => hook.result.current.show());
  act(() => hook.result.current.hide());
  expect(read.mock.calls[0]?.[2].aborted).toBe(true);
  expect(hook.result.current.busy).toBe(true);
  act(() => hook.result.current.show());
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => complete?.());
  expect(hook.result.current.value).toBeNull();
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.busy).toBe(false);
  act(() => hook.result.current.show());
  hook.rerender({
    source: { ...revision, revisionId: '00000000-0000-4000-8000-000000000099' },
  });
  expect(read.mock.calls[1]?.[2].aborted).toBe(true);
  expect(hook.result.current.open).toBe(false);
  act(() => hook.result.current.show());
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => complete?.());
  expect(hook.result.current.value).toBeNull();
  act(() => hook.result.current.show());
  hook.unmount();
  expect(read.mock.calls[2]?.[2].aborted).toBe(true);
  await act(async () => complete?.());
});

it.each(['FILE_NOT_FOUND', 'ASSET_MISMATCH', 'invalid', 'oversize'])(
  '원본 읽기/형식 실패 %s는 표를 바꾸지 않고 재시도할 수 있다',
  async (failure) => {
    vi.spyOn(projectApi, 'available').mockReturnValue(true);
    const { revision, session } = revisionFixture(false);
    const before = JSON.stringify(revision);
    const read = vi.spyOn(projectApi, 'read');
    if (failure === 'invalid' || failure === 'oversize')
      read.mockResolvedValueOnce({
        name: 'broken.musicxml',
        data: new ArrayBuffer(failure === 'invalid' ? 3 : 8 * 1024 * 1024 + 1),
      });
    else read.mockRejectedValueOnce(new Error(failure));
    const hook = renderHook(() => useRevisionScorePreview(revision));
    act(() => hook.result.current.show());
    await waitFor(() => expect(hook.result.current.error).not.toBeNull());
    expect(hook.result.current.value).toBeNull();
    expect(hook.result.current.busy).toBe(false);
    expect(JSON.stringify(revision)).toBe(before);
    act(() => hook.result.current.hide());
    read.mockResolvedValueOnce({
      name: 'standard.musicxml',
      data: Uint8Array.from(session.originalBytes).buffer,
    });
    act(() => hook.result.current.show());
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(hook.result.current.value).not.toBeNull();
    expect(hook.result.current.error).toBeNull();
  },
);

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
