import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { youtubePlayerApi } from './youtubePlayer';
import { useYoutubePlayer } from './useYoutubePlayer';
import type { YoutubeSelection } from './youtube';
const session = {
  schemaVersion: 1,
  sessionId: '00000000-0000-4000-8000-000000000001',
  videoId: 'Ab_cD-12345',
  frameUrl:
    'http://127.0.0.1:43210/00000000-0000-4000-8000-000000000001/player.html',
} as const;
const selection: YoutubeSelection = {
  kind: 'YOUTUBE_EMBED',
  videoId: session.videoId,
  selectedByUser: true,
};
beforeEach(() => {
  vi.spyOn(youtubePlayerApi, 'open').mockResolvedValue(session);
  vi.spyOn(youtubePlayerApi, 'close').mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('닫기/화면 이탈 이후 늦게 열린 세션도 닫고 다시 표시하지 않는다', async () => {
  let finish: (value: typeof session) => void = () => undefined;
  vi.mocked(youtubePlayerApi.open).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = renderHook(() => useYoutubePlayer(selection, true));
  view.unmount();
  await act(async () => finish(session));
  expect(youtubePlayerApi.close).toHaveBeenCalledWith(session.sessionId);
});
it('준비/재생/버퍼링/정지·153 오류를 관측하고 오류 때 세션을 닫는다', async () => {
  const view = renderHook(() => useYoutubePlayer(selection, true));
  await waitFor(() => expect(view.result.current.session).toEqual(session));
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  view.result.current.frame.current = iframe;
  function send(
    sequence: number,
    state: number | null = 1,
    errorCode: number | null = null,
  ) {
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source: iframe.contentWindow,
          origin: 'http://127.0.0.1:43210',
          data: {
            schemaVersion: 2,
            type: 'YOUTUBE_SNAPSHOT',
            sessionId: session.sessionId,
            videoId: session.videoId,
            sequence,
            ready: errorCode === null,
            state,
            currentTimeMs: errorCode === null ? 1234 : null,
            durationMs: errorCode === null ? 9000 : null,
            playbackRate: errorCode === null ? 0.75 : null,
            errorCode,
          },
        }),
      ),
    );
  }
  send(1, 1);
  expect(view.result.current.snapshot?.state).toBe(1);
  send(2, 3);
  expect(view.result.current.snapshot?.state).toBe(3);
  send(3, 2);
  expect(view.result.current.snapshot?.state).toBe(2);
  send(2, 1);
  expect(view.result.current.snapshot?.state).toBe(2);
  send(4, null, 153);
  expect(view.result.current.error).toContain('153');
  expect(view.result.current.session).toBeNull();
  expect(view.result.current.snapshot).toBeNull();
  expect(youtubePlayerApi.close).toHaveBeenCalledOnce();
  view.unmount();
  iframe.remove();
});
it('무응답은15초 뒤 닫고 늦은 응답도 정리한다', async () => {
  vi.useFakeTimers();
  let finish: (value: typeof session) => void = () => undefined;
  vi.mocked(youtubePlayerApi.open).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = renderHook(() => useYoutubePlayer(selection, true));
  act(() => vi.advanceTimersByTime(15000));
  expect(view.result.current.error).toContain('연결을 확인하지 못했습니다');
  await act(async () => finish(session));
  expect(view.result.current.session).toBeNull();
  expect(youtubePlayerApi.close).toHaveBeenCalledWith(session.sessionId);
  view.unmount();
});
it('선택/검증 모드 없이는 native 연결을 시작하지 않는다', () => {
  const view = renderHook(() => useYoutubePlayer(selection, false));
  expect(youtubePlayerApi.open).not.toHaveBeenCalled();
  view.unmount();
});
it('일시정지 응답의 위조·이전 요청은 무시하고 확인 시간 초과 시 닫는다', async () => {
  vi.useFakeTimers();
  const view = renderHook(
    ({ request }) => useYoutubePlayer(selection, true, request),
    { initialProps: { request: 0 } },
  );
  await act(async () => undefined);
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  view.result.current.frame.current = iframe;
  view.rerender({ request: 1 });
  expect(view.result.current.pausing).toBe(true);
  const ack = {
    schemaVersion: 1,
    type: 'YOUTUBE_PAUSED',
    sessionId: session.sessionId,
    videoId: session.videoId,
    requestId: 1,
  };
  for (const event of [
    new MessageEvent('message', {
      source: window,
      origin: 'http://127.0.0.1:43210',
      data: ack,
    }),
    new MessageEvent('message', {
      source: iframe.contentWindow,
      origin: 'https://evil.invalid',
      data: ack,
    }),
    new MessageEvent('message', {
      source: iframe.contentWindow,
      origin: 'http://127.0.0.1:43210',
      data: { ...ack, requestId: 0 },
    }),
    new MessageEvent('message', {
      source: iframe.contentWindow,
      origin: 'http://127.0.0.1:43210',
      data: { ...ack, extra: true },
    }),
  ])
    act(() => window.dispatchEvent(event));
  expect(view.result.current.pausing).toBe(true);
  act(() => vi.advanceTimersByTime(1500));
  expect(view.result.current.error).toContain('일시정지를 확인하지 못해');
  expect(view.result.current.session).toBeNull();
  expect(youtubePlayerApi.close).toHaveBeenCalledOnce();
  view.unmount();
  iframe.remove();
});
it('수신 중단은 관측 지연으로 표시하고 다음 유효 표본으로 복구한다', async () => {
  vi.useFakeTimers();
  const view = renderHook(() => useYoutubePlayer(selection, true));
  await act(async () => undefined);
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  view.result.current.frame.current = iframe;
  const send = (sequence: number) =>
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source: iframe.contentWindow,
          origin: 'http://127.0.0.1:43210',
          data: {
            schemaVersion: 2,
            type: 'YOUTUBE_SNAPSHOT',
            sessionId: session.sessionId,
            videoId: session.videoId,
            sequence,
            ready: true,
            state: 2,
            currentTimeMs: 1234,
            durationMs: 9000,
            playbackRate: 1,
            errorCode: null,
          },
        }),
      ),
    );
  send(1);
  act(() => vi.advanceTimersByTime(3500));
  expect(view.result.current.stale).toBe(true);
  send(2);
  expect(view.result.current.stale).toBe(false);
  act(() => vi.advanceTimersByTime(16000));
  expect(view.result.current.session).toEqual(session);
  expect(view.result.current.error).toBeNull();
  view.unmount();
  iframe.remove();
});
