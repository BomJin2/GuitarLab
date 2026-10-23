import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { YoutubeSyncPreview } from './YoutubeSyncPreview';
import type { YoutubeSnapshot } from './youtubePlayer';
import {
  projectYoutubeSyncApi,
  type ProjectYoutubeSync,
} from './projectYoutubeSync';
afterEach(() => vi.restoreAllMocks());
vi.mock('../score/ScoreViewport', () => ({
  ScoreViewport: ({ tick }: { tick: number | null }) => (
    <output data-testid="sync-cursor">{tick === null ? 'HIDDEN' : tick}</output>
  ),
}));
it('실제 불러온 악보의 임시 커서를 적용·숨김/해제하고 원래 싱크를 바꾸지 않는다', () => {
  const session = scoreEditingFixture();
  const original = JSON.stringify(session.document);
  const videoId = 'Ab_cD-12345';
  const snapshot: YoutubeSnapshot = {
    schemaVersion: 2,
    type: 'YOUTUBE_SNAPSHOT',
    sessionId: 'session',
    videoId,
    sequence: 1,
    ready: true,
    state: 2,
    currentTimeMs: 2000,
    durationMs: 10000,
    playbackRate: 1,
    errorCode: null,
  };
  const view = render(
    <YoutubeSyncPreview
      session={session}
      videoId={videoId}
      snapshot={snapshot}
      unavailable={false}
    />,
  );
  expect(screen.getByTestId('sync-cursor').textContent).toBe('HIDDEN');
  fireEvent.click(screen.getByRole('button', { name: '두 지점 임시 적용' }));
  expect(screen.getByRole('alert').textContent).toContain('입력');
  fireEvent.click(
    screen.getByRole('button', { name: '현재 영상 시간을 지점 1에 넣기' }),
  );
  fireEvent.change(screen.getByRole('spinbutton', { name: '영상 초 2' }), {
    target: { value: '6' },
  });
  fireEvent.click(screen.getByRole('button', { name: '두 지점 임시 적용' }));
  expect(screen.getByTestId('sync-cursor').textContent).toBe('0');
  view.rerender(
    <YoutubeSyncPreview
      session={session}
      videoId={videoId}
      snapshot={{
        ...snapshot,
        state: 1,
        currentTimeMs: 4000,
        playbackRate: 0.5,
      }}
      unavailable={false}
    />,
  );
  expect(screen.getByTestId('sync-cursor').textContent).toBe(
    String((session.playbackLookup.masterBars.at(-1)?.end ?? 0) / 2),
  );
  expect(
    screen.getByRole('button', { name: '현재 영상 시간을 지점 1에 넣기' }),
  ).toHaveProperty('disabled', true);
  view.rerender(
    <YoutubeSyncPreview
      session={session}
      videoId={videoId}
      snapshot={{ ...snapshot, currentTimeMs: 4000 }}
      unavailable={true}
    />,
  );
  expect(screen.getByTestId('sync-cursor').textContent).toBe('HIDDEN');
  fireEvent.click(screen.getByRole('button', { name: '맞춤 해제' }));
  expect(screen.getByTestId('sync-cursor').textContent).toBe('HIDDEN');
  view.rerender(
    <YoutubeSyncPreview
      session={session}
      videoId={videoId}
      snapshot={{ ...snapshot, videoId: 'Zy_xW-98765' }}
      unavailable={false}
    />,
  );
  expect(
    screen.getByRole('button', { name: '두 지점 임시 적용' }),
  ).toHaveProperty('disabled', true);
  expect(JSON.stringify(session.document)).toBe(original);
  expect(view.container.querySelector('audio,video,iframe')).toBeNull();
  expect(screen.getByText(/저장하지 않은 적용은/)).toBeTruthy();
});
it('저장한 revision의 맞춤만 명시적 저장·읽기로 적용하고 미저장 편집본은 잠근다', async () => {
  const original = scoreEditingFixture();
  const projectId = '00000000-0000-4000-8000-000000000001';
  const revisionId = '00000000-0000-4000-8000-000000000002';
  const session = {
    ...original,
    savedRevision: { projectId, revisionId, document: original.document },
  };
  const before = JSON.stringify(session.document);
  const videoId = 'Ab_cD-12345';
  const endTick = session.playbackLookup.masterBars.at(-1)?.end ?? 0;
  const value: ProjectYoutubeSync = {
    schemaVersion: 1,
    projectId,
    revisionId,
    videoId,
    trackId: session.document.tracks[0]!.id,
    profile: {
      scoreId: session.document.id,
      endTick,
      durationMs: 10000,
      anchors: [
        { scoreTick: 0, audioTimeMs: 0 },
        { scoreTick: endTick, audioTimeMs: 8000 },
      ],
    },
  };
  vi.spyOn(projectYoutubeSyncApi, 'available').mockReturnValue(true);
  vi.spyOn(projectYoutubeSyncApi, 'save').mockImplementation(
    async (request) => request,
  );
  vi.spyOn(projectYoutubeSyncApi, 'load').mockResolvedValue(value);
  const snapshot: YoutubeSnapshot = {
    schemaVersion: 2,
    type: 'YOUTUBE_SNAPSHOT',
    sessionId: 'session',
    videoId,
    sequence: 1,
    ready: true,
    state: 2,
    currentTimeMs: 2000,
    durationMs: 10000,
    playbackRate: 1,
    errorCode: null,
  };
  const props = {
    session,
    videoId,
    snapshot,
    unavailable: false,
    projectId,
    scoreSaved: true,
  };
  const view = render(<YoutubeSyncPreview {...props} />);
  expect(projectYoutubeSyncApi.load).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '영상 맞춤 저장' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.change(screen.getByRole('spinbutton', { name: '영상 초 1' }), {
    target: { value: '0' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: '영상 초 2' }), {
    target: { value: '8' },
  });
  fireEvent.click(screen.getByRole('button', { name: '두 지점 임시 적용' }));
  fireEvent.click(screen.getByRole('button', { name: '영상 맞춤 저장' }));
  await screen.findByText('영상 맞춤을 프로젝트에 저장했습니다.');
  expect(projectYoutubeSyncApi.save).toHaveBeenLastCalledWith(
    value,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  fireEvent.click(screen.getByRole('button', { name: '맞춤 해제' }));
  expect(screen.getByTestId('sync-cursor').textContent).toBe('HIDDEN');
  fireEvent.click(screen.getByRole('button', { name: '저장 맞춤 다시 읽기' }));
  await screen.findByText('저장 맞춤을 읽고 적용했습니다.');
  expect(screen.getByTestId('sync-cursor').textContent).toBe(
    String(endTick / 4),
  );
  expect(screen.getByRole('spinbutton', { name: '영상 초 2' })).toHaveProperty(
    'value',
    '8',
  );
  fireEvent.click(screen.getByRole('button', { name: '저장 맞춤 삭제' }));
  await waitFor(() =>
    expect(projectYoutubeSyncApi.save).toHaveBeenLastCalledWith(
      { ...value, profile: null },
      expect.any(AbortSignal),
      expect.any(Function),
    ),
  );
  expect(screen.getByTestId('sync-cursor').textContent).toBe(
    String(endTick / 4),
  );
  view.rerender(<YoutubeSyncPreview {...props} scoreSaved={false} />);
  expect(
    screen.getByRole('button', { name: '저장 맞춤 다시 읽기' }),
  ).toHaveProperty('disabled', true);
  expect(JSON.stringify(session.document)).toBe(before);
  expect(view.container.querySelector('iframe,audio,video')).toBeNull();
});
