import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AiDraftPanel } from './AiDraftPanel';
import { transcriptionApi, type AiDraft } from './transcription';
import {
  transcriptionFixture,
  transcriptionRequest,
} from '../../test/transcriptionFixture';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { projectFixture } from '../../test/projectFixture';
import type { ProjectController } from '../library/useProjects';
import { useState } from 'react';
import { useScoreEditing } from '../score/useScoreEditing';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { separationApi, type SeparationPreview } from './separation';
import { separationFixture } from '../../test/separationFixture';
import { importedStemFixture } from '../../test/importedStemFixture';
import { importedStemsApi } from '../performance/importedStems';
vi.mock('../performance/importedStems', async (original) => ({
  ...(await original<typeof import('../performance/importedStems')>()),
  importedStemsApi: {
    available: () => true,
    import: vi.fn(),
    list: vi.fn(),
    read: vi.fn(),
  },
}));
vi.mock('./separation', () => ({ separationApi: { restore: vi.fn() } }));
vi.mock('./transcription', async (original) => ({
  ...(await original<typeof import('./transcription')>()),
  transcriptionApi: {
    available: () => true,
    analyze: vi.fn(),
    restore: vi.fn(),
  },
}));
vi.mock('../score/ScoreViewport', () => ({
  ScoreViewport: () => <div>AI TAB 테스트 표시</div>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
// 실제 hook에서 필요한 프로젝트 상태만 사용하며 저장 작업은 실행하지 않습니다.
const details = projectFixture();
details.project.id = transcriptionRequest.projectId;
const project: Pick<ProjectController, 'details' | 'audioAssetId' | 'busy'> = {
  details,
  audioAssetId: transcriptionRequest.assetId,
  busy: false,
};

it('명시적 전체 기타 선택에서만 저장 UUID를 조회하고 원본으로 바꾸면 이전 초안을 비운다', async () => {
  const info = {
    ...separationFixture(),
    projectId: transcriptionRequest.projectId,
    assetId: transcriptionRequest.assetId,
  };
  const stemId = info.stems[0]?.id;
  if (!stemId) throw new Error('테스트 stem 필요');
  vi.mocked(separationApi.restore).mockResolvedValue({ info, audio: [] });
  vi.mocked(transcriptionApi.analyze).mockResolvedValue({
    ...transcriptionFixture(),
    stemId,
  });
  render(<AiDraftPanel session={scoreEditingFixture()} project={project} />);
  expect(separationApi.restore).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'AI 분석 입력' }), {
    target: { value: 'guitar' },
  });
  expect(separationApi.restore).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: '저장 전체 기타를 AI 카피' }),
  );
  await screen.findByText(/입력: 저장 전체 기타/);
  expect(transcriptionApi.analyze).toHaveBeenCalledWith(
    expect.objectContaining({ stemId, assetId: transcriptionRequest.assetId }),
    expect.any(AbortSignal),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'AI 분석 입력' }), {
    target: { value: 'original' },
  });
  expect(screen.queryByText(/AI 초안 · 1음/)).toBeNull();
  vi.mocked(transcriptionApi.restore).mockResolvedValue(transcriptionFixture());
  fireEvent.click(
    screen.getByRole('button', { name: '저장된 AI 초안 불러오기' }),
  );
  await screen.findByText('입력: 프로젝트 원본 WAV');
  expect(transcriptionApi.restore).toHaveBeenCalledWith(
    expect.not.objectContaining({ stemId }),
    expect.any(AbortSignal),
  );
  expect(separationApi.restore).toHaveBeenCalledTimes(1);
});

it('사용자 파일을 명시적으로 목록·선택한 뒤에만 분석하고 별도 출처의 초안을 복원한다', async () => {
  const stem = importedStemFixture();
  const draft = { ...transcriptionFixture(), importedStemId: stem.id };
  vi.mocked(importedStemsApi.list).mockResolvedValue([stem]);
  vi.mocked(transcriptionApi.analyze).mockResolvedValue(draft);
  vi.mocked(transcriptionApi.restore).mockResolvedValue(draft);
  const session = scoreEditingFixture();
  const before = JSON.stringify(session.document);
  render(<AiDraftPanel session={session} project={project} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'AI 분석 입력' }), {
    target: { value: 'imported' },
  });
  expect(importedStemsApi.list).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole('button', { name: '사용자 기타를 AI 카피' })
      .hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: '사용자 기타 목록 읽기' }),
  );
  await screen.findByRole('option', { name: /사용자 리드.wav/ });
  fireEvent.change(
    screen.getByRole('combobox', { name: 'AI 카피할 사용자 기타' }),
    { target: { value: stem.id } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: '사용자 기타를 AI 카피' }),
  );
  await screen.findByText(`입력: 사용자 제공 기타 · ${stem.id}`);
  expect(transcriptionApi.analyze).toHaveBeenLastCalledWith(
    expect.objectContaining({
      importedStemId: stem.id,
      assetId: transcriptionRequest.assetId,
    }),
    expect.any(AbortSignal),
  );
  expect(
    vi.mocked(transcriptionApi.analyze).mock.calls[0]?.[0].stemId,
  ).toBeUndefined();
  fireEvent.click(
    screen.getByRole('button', { name: '저장된 AI 초안 불러오기' }),
  );
  await screen.findByText(`입력: 사용자 제공 기타 · ${stem.id}`);
  expect(transcriptionApi.restore).toHaveBeenCalledWith(
    expect.objectContaining({ importedStemId: stem.id }),
    expect.any(AbortSignal),
  );
  expect(importedStemsApi.import).not.toHaveBeenCalled();
  expect(importedStemsApi.read).not.toHaveBeenCalled();
  expect(separationApi.restore).not.toHaveBeenCalled();
  expect(JSON.stringify(session.document)).toBe(before);
});

it('60초를 넘는 사용자 기타를 선택해도 분석을 시작하지 않는다', async () => {
  const stem = {
    ...importedStemFixture(),
    durationMs: 61000,
    frames: 48000 * 61,
    bytes: 48000 * 61 * 4 + 58,
  };
  vi.mocked(importedStemsApi.list).mockResolvedValue([stem]);
  render(<AiDraftPanel session={scoreEditingFixture()} project={project} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'AI 분석 입력' }), {
    target: { value: 'imported' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: '사용자 기타 목록 읽기' }),
  );
  await screen.findByRole('option', { name: /사용자 리드.wav/ });
  fireEvent.change(
    screen.getByRole('combobox', { name: 'AI 카피할 사용자 기타' }),
    { target: { value: stem.id } },
  );
  expect(
    screen
      .getByRole('button', { name: '사용자 기타를 AI 카피' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(transcriptionApi.analyze).not.toHaveBeenCalled();
});

it('사용자 기타 선택을 바꾸면 이전 초안을 지우고 새 분석을 자동 시작하지 않는다', async () => {
  const first = importedStemFixture();
  const second = {
    ...first,
    id: crypto.randomUUID(),
    name: '다른 사용자 파일.wav',
  };
  vi.mocked(importedStemsApi.list).mockResolvedValue([first, second]);
  vi.mocked(transcriptionApi.analyze).mockResolvedValue({
    ...transcriptionFixture(),
    importedStemId: first.id,
  });
  render(<AiDraftPanel session={scoreEditingFixture()} project={project} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'AI 분석 입력' }), {
    target: { value: 'imported' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: '사용자 기타 목록 읽기' }),
  );
  await screen.findByRole('option', { name: /다른 사용자 파일.wav/ });
  fireEvent.change(
    screen.getByRole('combobox', { name: 'AI 카피할 사용자 기타' }),
    { target: { value: first.id } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: '사용자 기타를 AI 카피' }),
  );
  await screen.findByText(`입력: 사용자 제공 기타 · ${first.id}`);
  fireEvent.change(
    screen.getByRole('combobox', { name: 'AI 카피할 사용자 기타' }),
    { target: { value: second.id } },
  );
  expect(screen.queryByText(/AI 초안 · 1음/)).toBeNull();
  expect(transcriptionApi.analyze).toHaveBeenCalledTimes(1);
});

it('사용자 목록 조회의 실제 종료까지 입력 전환을 막고 취소 조작을 유지한다', async () => {
  let finish!: (value: ReturnType<typeof importedStemFixture>[]) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(importedStemsApi.list).mockImplementationOnce(
    (_project, current) => {
      signal = current;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  render(<AiDraftPanel session={scoreEditingFixture()} project={project} />);
  const source = screen.getByRole<HTMLSelectElement>('combobox', {
    name: 'AI 분석 입력',
  });
  fireEvent.change(source, { target: { value: 'imported' } });
  fireEvent.click(
    screen.getByRole('button', { name: '사용자 기타 목록 읽기' }),
  );
  const lockedDuringRead = source.disabled;
  fireEvent.click(screen.getByRole('button', { name: '목록 조회 취소' }));
  expect(signal?.aborted).toBe(true);
  const lockedUntilFinished = source.disabled;
  await act(async () => finish([importedStemFixture()]));
  expect(lockedDuringRead).toBe(true);
  expect(lockedUntilFinished).toBe(true);
  expect(source.disabled).toBe(false);
  expect(screen.queryByRole('option', { name: /사용자 리드.wav/ })).toBeNull();
  expect(transcriptionApi.analyze).not.toHaveBeenCalled();
});

it('저장 기타가 없거나 실제 검출이 비면 음표를 만들거나 원본으로 자동 폴백하지 않는다', async () => {
  vi.mocked(separationApi.restore).mockResolvedValueOnce(null);
  render(<AiDraftPanel session={scoreEditingFixture()} project={project} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'AI 분석 입력' }), {
    target: { value: 'guitar' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: '저장 전체 기타를 AI 카피' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    '저장된 전체 기타 분리 결과가 없습니다',
  );
  expect(transcriptionApi.analyze).not.toHaveBeenCalled();
  const info = {
    ...separationFixture(),
    projectId: transcriptionRequest.projectId,
    assetId: transcriptionRequest.assetId,
  };
  vi.mocked(separationApi.restore).mockResolvedValueOnce({ info, audio: [] });
  vi.mocked(transcriptionApi.analyze).mockRejectedValueOnce(
    new Error('AI_TRANSCRIPTION_EMPTY'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: '저장 전체 기타를 AI 카피' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    '음표를 찾지 못했습니다',
  );
  expect(screen.queryByText(/AI 초안 ·/)).toBeNull();
});

it('저장 기타 조회 중 프로젝트 문맥이 바뀌면 늦은 입력으로 분석하지 않는다', async () => {
  let finish: ((value: SeparationPreview | null) => void) | undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(separationApi.restore).mockImplementationOnce((_, s) => {
    signal = s;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const session = scoreEditingFixture();
  const view = render(<AiDraftPanel session={session} project={project} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'AI 분석 입력' }), {
    target: { value: 'guitar' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: '저장 전체 기타를 AI 카피' }),
  );
  view.rerender(
    <AiDraftPanel
      session={session}
      project={{ ...project, audioAssetId: crypto.randomUUID() }}
    />,
  );
  expect(signal?.aborted).toBe(true);
  await act(async () => finish?.({ info: separationFixture(), audio: [] }));
  expect(transcriptionApi.analyze).not.toHaveBeenCalled();
  expect(screen.queryByText(/AI 초안 ·/)).toBeNull();
});
it('복원은 명시적 조회로만 실행하고 검토 체크 전에는 적용하지 않으며 실제 editor Undo/Redo와 연결한다', async () => {
  vi.mocked(transcriptionApi.restore).mockResolvedValue(transcriptionFixture());
  function Harness() {
    const [session, setSession] = useState(scoreEditingFixture());
    const editor = useScoreEditing(
      session,
      (update) =>
        setSession((previous) => {
          const next = typeof update === 'function' ? update(previous) : update;
          if (!next) throw new Error('테스트 문서 유지');
          return next;
        }),
      false,
    );
    return (
      <>
        <AiDraftPanel session={session} project={project} editor={editor} />
        <p data-testid="applied">
          {session.document.tracks[0]?.notes[0]?.fret} ·{' '}
          {session.document.tracks[0]?.notes[0]?.source}
        </p>
        <button onClick={editor.undo}>테스트 되돌리기</button>
        <button onClick={editor.redo}>테스트 다시 실행</button>
      </>
    );
  }
  const engine = new PlayerEngine();
  render(
    <Context.Provider value={engine}>
      <Harness />
    </Context.Provider>,
  );
  expect(transcriptionApi.restore).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: '저장된 AI 초안 불러오기' }),
  );
  await screen.findByText(/AI 초안 · 1음/);
  const apply = screen.getByRole('button', { name: '선택 트랙에 초안 적용' });
  expect(apply.hasAttribute('disabled')).toBe(true);
  fireEvent.click(apply);
  expect(screen.getByTestId('applied').textContent).toBe('0 · import');
  fireEvent.click(
    screen.getByRole('checkbox', { name: /불확실한 AI 초안을 검토/ }),
  );
  fireEvent.click(apply);
  expect(screen.getByTestId('applied').textContent).toBe('3 · ai');
  fireEvent.click(screen.getByRole('button', { name: '테스트 되돌리기' }));
  expect(screen.getByTestId('applied').textContent).toBe('0 · import');
  fireEvent.click(screen.getByRole('button', { name: '테스트 다시 실행' }));
  expect(screen.getByTestId('applied').textContent).toBe('3 · ai');
  expect(engine.getSnapshot().playbackEpoch).toBe(3);
  expect(transcriptionApi.analyze).not.toHaveBeenCalled();
});
it('명시적 실행 전 분석하지 않으며 취소 결과를 버리고 재시도한 초안만 표시한다', async () => {
  let finish: (v: AiDraft) => void = () => undefined;
  vi.mocked(transcriptionApi.analyze).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<AiDraftPanel session={scoreEditingFixture()} project={project} />);
  expect(transcriptionApi.analyze).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: '프로젝트 WAV를 AI 카피' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'AI 분석 취소' }));
  await act(async () => finish(transcriptionFixture()));
  expect(screen.queryByText(/AI 초안 · 1음/)).toBeNull();
  expect(screen.getByText(/분석을 취소했습니다/)).toBeTruthy();
  vi.mocked(transcriptionApi.analyze).mockResolvedValue(transcriptionFixture());
  fireEvent.click(
    screen.getByRole('button', { name: '프로젝트 WAV를 AI 카피' }),
  );
  await screen.findByText(/AI 초안 · 1음/);
  expect(screen.getByText('낮은 모델 활성도')).toBeTruthy();
  expect(screen.getByText(/정답 확률이 아닙니다/)).toBeTruthy();
});
it('자산 전환 시 취소하고 늦게 도착한 초안을 다른 프로젝트에 표시하지 않는다', async () => {
  let finish: (v: AiDraft) => void = () => undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(transcriptionApi.analyze).mockImplementationOnce((_, s) => {
    signal = s;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const session = scoreEditingFixture();
  const view = render(<AiDraftPanel session={session} project={project} />);
  fireEvent.click(
    screen.getByRole('button', { name: '프로젝트 WAV를 AI 카피' }),
  );
  view.rerender(
    <AiDraftPanel
      session={session}
      project={{ ...project, audioAssetId: crypto.randomUUID() }}
    />,
  );
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(transcriptionFixture()));
  expect(screen.queryByText(/AI 초안 · 1음/)).toBeNull();
});
it('모델 누락 오류를 표시하고 프로젝트 음원이 없으면 실행을 막는다', async () => {
  vi.mocked(transcriptionApi.analyze).mockRejectedValue(
    new Error('AI_MODEL_MISSING'),
  );
  const session = scoreEditingFixture();
  const view = render(<AiDraftPanel session={session} project={project} />);
  fireEvent.click(
    screen.getByRole('button', { name: '프로젝트 WAV를 AI 카피' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'AI 모델 설치 관리에서 설치 / 재검증하세요',
  );
  view.rerender(<AiDraftPanel session={session} />);
  expect(
    screen
      .getByRole('button', { name: '프로젝트 WAV를 AI 카피' })
      .hasAttribute('disabled'),
  ).toBe(true);
});
