import script from '../../../src-tauri/src/backing/player.js?raw';
import { expect, it, vi } from 'vitest';
function runWrapper(context: Record<string, unknown>) {
  // 외부 API를 실행하지 않고 실제 번들 wrapper에 자체 stub만 제공합니다.
  new Function(...Object.keys(context), script)(...Object.values(context));
}
type Options = {
  playerVars: Record<string, unknown>;
  events: {
    onReady(): void;
    onStateChange(): void;
    onError(event: { data: number }): void;
  };
};
it('격리 wrapper가 공식 API 관측값만 전송하고 재생/오디오 추출을 호출하지 않는다', () => {
  let options: Options | undefined;
  let state = 1;
  let videoUrl = 'https://www.youtube.com/watch?v=Ab_cD-12345';
  const listeners = new Map<string, (event: MessageEvent<unknown>) => void>();
  const controller = {
    getPlayerState: () => state,
    getCurrentTime: () => 1.234,
    getDuration: () => 90,
    getPlaybackRate: () => 0.75,
    getVideoUrl: () => videoUrl,
    destroy: vi.fn(),
    pauseVideo: vi.fn(() => {
      state = 2;
    }),
  };
  const postMessage = vi.fn(),
    append = vi.fn(),
    setInterval = vi.fn(),
    clearInterval = vi.fn();
  const window = {
    parent: { postMessage },
    addEventListener: vi.fn(
      (name: string, listener: (event: MessageEvent<unknown>) => void) =>
        listeners.set(name, listener),
    ),
    onYouTubeIframeAPIReady: undefined as (() => void) | undefined,
    YT: {
      Player: function (_id: string, value: Options) {
        options = value;
        return controller;
      },
    },
  };
  const error = { hidden: true, textContent: '' };
  runWrapper({
    window,
    document: {
      referrer: 'http://tauri.localhost/project?private=discarded',
      querySelector: (name: string) => ({
        content: name.includes('session') ? 'session' : 'Ab_cD-12345',
      }),
      createElement: () => ({}),
      head: { append },
      getElementById: () => error,
    },
    URL,
    location: { origin: 'http://127.0.0.1:43210' },
    setInterval,
    clearInterval,
    console,
  });
  expect(append).toHaveBeenCalledWith(
    expect.objectContaining({ src: 'https://www.youtube.com/iframe_api' }),
  );
  window.onYouTubeIframeAPIReady?.();
  expect(options?.playerVars).toEqual({
    autoplay: 0,
    controls: 1,
    playsinline: 1,
    origin: 'http://127.0.0.1:43210',
    widget_referrer: 'http://tauri.localhost',
  });
  options?.events.onReady();
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      ready: true,
      state: 1,
      currentTimeMs: 1234,
      durationMs: 90000,
      playbackRate: 0.75,
      sequence: 1,
    }),
    'http://tauri.localhost',
  );
  const pauseData = {
    schemaVersion: 1,
    type: 'YOUTUBE_PAUSE',
    sessionId: 'session',
    videoId: 'Ab_cD-12345',
    requestId: 1,
  };
  const pause = listeners.get('message');
  pause?.({
    source: {},
    origin: 'http://tauri.localhost',
    data: pauseData,
  } as MessageEvent<unknown>);
  pause?.({
    source: window.parent,
    origin: 'https://evil.invalid',
    data: pauseData,
  } as unknown as MessageEvent<unknown>);
  pause?.({
    source: window.parent,
    origin: 'http://tauri.localhost',
    data: { ...pauseData, unknown: true },
  } as unknown as MessageEvent<unknown>);
  expect(controller.pauseVideo).not.toHaveBeenCalled();
  pause?.({
    source: window.parent,
    origin: 'http://tauri.localhost',
    data: pauseData,
  } as unknown as MessageEvent<unknown>);
  expect(controller.pauseVideo).toHaveBeenCalledOnce();
  expect(postMessage).toHaveBeenLastCalledWith(
    {
      schemaVersion: 1,
      type: 'YOUTUBE_PAUSED',
      sessionId: 'session',
      videoId: 'Ab_cD-12345',
      requestId: 1,
    },
    'http://tauri.localhost',
  );
  videoUrl = 'https://www.youtube.com/watch?v=Zy_xW-98765';
  options?.events.onStateChange();
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      schemaVersion: 2,
      type: 'YOUTUBE_SNAPSHOT',
      videoId: 'Zy_xW-98765',
    }),
    'http://tauri.localhost',
  );
  videoUrl = '';
  options?.events.onStateChange();
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: true, videoId: null, errorCode: null }),
    'http://tauri.localhost',
  );
  options?.events.onError({ data: 153 });
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ready: false,
      errorCode: 153,
      currentTimeMs: null,
      state: null,
    }),
    'http://tauri.localhost',
  );
  expect(controller.destroy).toHaveBeenCalledOnce();
  expect(error.hidden).toBe(false);
  expect(script).not.toMatch(
    /playVideo\(|fetch\(|getUserMedia|AudioContext|__TAURI/,
  );
});
it('허용되지 않은 부모나 직접 연 페이지에서는 외부 script를 만들지 않는다', () => {
  const append = vi.fn();
  runWrapper({
    window: { parent: {} },
    document: { referrer: 'https://evil.invalid', head: { append } },
    URL,
  });
  expect(append).not.toHaveBeenCalled();
});
it('API 준비 전 중지 요청을 유지하고 실제 중지 상태에서만 확인한다', () => {
  let options: Options | undefined;
  let state = 3;
  const listeners = new Map<string, (event: unknown) => void>();
  const postMessage = vi.fn();
  const controller = {
    getPlayerState: () => state,
    getCurrentTime: () => 0,
    getDuration: () => 10,
    getPlaybackRate: () => 1,
    getVideoUrl: () => 'https://www.youtube.com/watch?v=Ab_cD-12345',
    pauseVideo: vi.fn(),
    destroy: vi.fn(),
  };
  const window = {
    parent: { postMessage },
    addEventListener: (name: string, callback: (event: unknown) => void) =>
      listeners.set(name, callback),
    onYouTubeIframeAPIReady: undefined as (() => void) | undefined,
    YT: {
      Player: function (_id: string, value: Options) {
        options = value;
        return controller;
      },
    },
  };
  runWrapper({
    window,
    document: {
      referrer: 'http://tauri.localhost',
      querySelector: (name: string) => ({
        content: name.includes('session') ? 'session' : 'Ab_cD-12345',
      }),
      createElement: () => ({}),
      head: { append: vi.fn() },
      getElementById: () => ({}),
    },
    URL,
    location: { origin: 'http://127.0.0.1:43210' },
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    console,
  });
  listeners.get('message')?.({
    source: window.parent,
    origin: 'http://tauri.localhost',
    data: {
      schemaVersion: 1,
      type: 'YOUTUBE_PAUSE',
      sessionId: 'session',
      videoId: 'Ab_cD-12345',
      requestId: 1,
    },
  });
  expect(controller.pauseVideo).not.toHaveBeenCalled();
  window.onYouTubeIframeAPIReady?.();
  options?.events.onReady();
  expect(controller.pauseVideo).toHaveBeenCalledOnce();
  expect(
    postMessage.mock.calls.some(
      ([message]) => message.type === 'YOUTUBE_PAUSED',
    ),
  ).toBe(false);
  state = 2;
  options?.events.onStateChange();
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'YOUTUBE_PAUSED', requestId: 1 }),
    'http://tauri.localhost',
  );
});
