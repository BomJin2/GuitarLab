import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { projectFixture } from '../../test/projectFixture';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import {
  transcriptionFixture,
  transcriptionRequest,
} from '../../test/transcriptionFixture';
import { transcriptionApi, type AiDraft } from './transcription';
import { useTranscription } from './useTranscription';
import { importedStemFixture } from '../../test/importedStemFixture';

vi.mock('./transcription', async (original) => ({
  ...(await original<typeof import('./transcription')>()),
  transcriptionApi: {
    available: () => true,
    analyze: vi.fn(),
    restore: vi.fn(),
  },
}));
beforeEach(() => vi.resetAllMocks());

it('다른 프로젝트의 사용자 기타로 실행하거나 원본으로 자동 대체하지 않는다', async () => {
  const initial = props();
  const stem = { ...importedStemFixture(), projectId: crypto.randomUUID() };
  const { result } = renderHook(() =>
    useTranscription(initial.session, initial.project, stem),
  );
  act(() => result.current.selectSource('imported'));
  expect(result.current.available).toBe(false);
  await act(async () => {
    await result.current.analyze();
    await result.current.restore();
  });
  expect(transcriptionApi.analyze).not.toHaveBeenCalled();
  expect(transcriptionApi.restore).not.toHaveBeenCalled();
});

function props() {
  return {
    session: scoreEditingFixture(),
    project: {
      details: projectFixture(),
      audioAssetId: transcriptionRequest.assetId,
      busy: false,
    },
  };
}

it.each(['음원', '프로젝트', '악보', '분석 입력'])(
  '%s 변경의 첫 반환부터 이전 초안과 렌더 미리보기를 숨긴다',
  async (change) => {
    vi.mocked(transcriptionApi.restore).mockResolvedValue(
      transcriptionFixture(),
    );
    const observations: ReturnType<typeof useTranscription>[] = [];
    const initial = props();
    const { result, rerender } = renderHook(
      (value) => {
        const state = useTranscription(value.session, value.project);
        observations.push(state);
        return state;
      },
      { initialProps: initial },
    );
    await act(async () => result.current.restore());
    expect(result.current.draft).not.toBeNull();
    expect(result.current.preview.value).not.toBeNull();
    observations.length = 0;
    if (change === '분석 입력')
      act(() => result.current.selectSource('guitar'));
    else if (change === '음원')
      rerender({
        ...initial,
        project: { ...initial.project, audioAssetId: crypto.randomUUID() },
      });
    else if (change === '프로젝트')
      rerender({
        ...initial,
        project: {
          ...initial.project,
          details: {
            ...initial.project.details,
            project: {
              ...initial.project.details.project,
              id: crypto.randomUUID(),
            },
          },
        },
      });
    else
      rerender({
        ...initial,
        session: {
          ...initial.session,
          document: { ...initial.session.document, title: '다른 악보' },
        },
      });
    expect(observations.length).toBeGreaterThan(0);
    expect(
      observations.every(
        (value) => value.draft === null && value.preview.value === null,
      ),
    ).toBe(true);
  },
);

it('같은 음원으로 돌아와도 이전 분석·조회·입력 변경 명령을 재사용하지 않는다', async () => {
  vi.mocked(transcriptionApi.analyze).mockResolvedValue(transcriptionFixture());
  vi.mocked(transcriptionApi.restore).mockResolvedValue(transcriptionFixture());
  const initial = props();
  const { result, rerender } = renderHook(
    (value) => useTranscription(value.session, value.project),
    { initialProps: initial },
  );
  const old = result.current;
  rerender({
    ...initial,
    project: { ...initial.project, audioAssetId: crypto.randomUUID() },
  });
  rerender(initial);
  await act(async () => {
    await old.analyze();
    await old.restore();
    old.selectSource('guitar');
  });
  expect(transcriptionApi.analyze).not.toHaveBeenCalled();
  expect(transcriptionApi.restore).not.toHaveBeenCalled();
  expect(result.current.source).toBe('original');
});

it('이전 화면의 취소 명령이 새 분석을 취소하지 않는다', async () => {
  let finish!: (draft: AiDraft) => void;
  vi.mocked(transcriptionApi.analyze).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const initial = props();
  const { result, rerender } = renderHook(
    (value) => useTranscription(value.session, value.project),
    { initialProps: initial },
  );
  const oldCancel = result.current.cancel;
  const assetId = crypto.randomUUID();
  rerender({
    ...initial,
    project: { ...initial.project, audioAssetId: assetId },
  });
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.analyze();
  });
  act(oldCancel);
  const aborted = vi.mocked(transcriptionApi.analyze).mock.calls[0]?.[1]
    .aborted;
  await act(async () => {
    finish({ ...transcriptionFixture(), assetId });
    await pending;
  });
  expect(aborted).toBe(false);
  expect(result.current.draft).not.toBeNull();
});

it('화면 이탈 뒤에 보관된 함수는 새 분석이나 파일 조회를 시작하지 않는다', async () => {
  vi.mocked(transcriptionApi.analyze).mockResolvedValue(transcriptionFixture());
  vi.mocked(transcriptionApi.restore).mockResolvedValue(transcriptionFixture());
  const initial = props();
  const { result, unmount } = renderHook(() =>
    useTranscription(initial.session, initial.project),
  );
  const old = result.current;
  unmount();
  await act(async () => {
    await old.analyze();
    await old.restore();
  });
  expect(transcriptionApi.analyze).not.toHaveBeenCalled();
  expect(transcriptionApi.restore).not.toHaveBeenCalled();
});
