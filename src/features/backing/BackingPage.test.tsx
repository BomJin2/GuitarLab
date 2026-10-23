import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BackingPage } from './BackingPage';
import { projectBackingApi } from './projectBacking';
import { youtubePlayerApi } from './youtubePlayer';

const native = vi.hoisted(() => ({
  enabled: false,
  listen: vi.fn(),
  pause: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.enabled }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ listen: native.listen }),
}));
vi.mock('../player/usePlayer', () => ({
  usePlayerEngine: () => ({ pause: native.pause }),
}));
let observe: IntersectionObserverCallback;
let disconnect: ReturnType<typeof vi.fn>;
const originalScroll = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);
function viewport(ratio: number) {
  act(() =>
    observe(
      [
        {
          isIntersecting: ratio > 0,
          intersectionRatio: ratio,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    ),
  );
}
beforeEach(() => {
  native.enabled = false;
  native.pause.mockReset();
  native.listen.mockReset().mockResolvedValue(vi.fn());
  disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observe = callback;
      }
      observe() {
        observe(
          [
            {
              isIntersecting: true,
              intersectionRatio: 1,
            } as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver,
        );
      }
      disconnect() {
        disconnect();
      }
    },
  );
});
afterEach(() => {
  if (originalScroll)
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScroll,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function open() {
  fireEvent.change(
    screen.getByRole('textbox', { name: 'YouTube 동영상 URL' }),
    { target: { value: 'https://youtu.be/Ab_cD-12345?si=discarded' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: '안내에 동의하고 YouTube 열기' }),
  );
}
const frame = () => screen.queryByTitle('YouTube 공식 동영상 플레이어');

it('API 체크 변경은 창/표시 관찰을 다시 연결하지 않고 화면 비율 응답 없이 열 수 있다', async () => {
  native.enabled = true;
  vi.spyOn(youtubePlayerApi, 'available').mockReturnValue(true);
  vi.spyOn(youtubePlayerApi, 'open').mockResolvedValue({
    schemaVersion: 1,
    sessionId: '00000000-0000-4000-8000-000000000001',
    videoId: 'Ab_cD-12345',
    frameUrl:
      'http://127.0.0.1:43210/00000000-0000-4000-8000-000000000001/player.html',
  });
  vi.spyOn(youtubePlayerApi, 'close').mockResolvedValue();
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  });
  const view = render(<BackingPage locked={false} />);
  await act(async () => undefined);
  viewport(0.2);
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'https://youtu.be/Ab_cD-12345' },
  });
  fireEvent.click(
    screen.getByRole('checkbox', { name: '재생 상태·시간 확인 (검증)' }),
  );
  expect(
    screen.getByRole('button', { name: '안내에 동의하고 YouTube 열기' }),
  ).toHaveProperty('disabled', false);
  expect(native.listen).toHaveBeenCalledTimes(1);
  expect(disconnect).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: '안내에 동의하고 YouTube 열기' }),
  );
  await screen.findByTitle('YouTube 공식 동영상 플레이어');
  expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
  act(() =>
    observe(
      [
        { isIntersecting: false, intersectionRatio: 0, time: 0 },
        {
          isIntersecting: true,
          intersectionRatio: 1,
          time: performance.now() + 1,
        },
      ] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(frame()).toBeTruthy();
  view.unmount();
});

it('API 검증 선택도 명시적 열기 전에는 접속하지 않고 소유 frame의 실제 관측값만 표시한다', async () => {
  native.enabled = true;
  let blur = () => undefined;
  native.listen.mockImplementation((_name, callback: () => undefined) => {
    blur = callback;
    return Promise.resolve(vi.fn());
  });
  const session = {
    schemaVersion: 1,
    sessionId: '00000000-0000-4000-8000-000000000001',
    videoId: 'Ab_cD-12345',
    frameUrl:
      'http://127.0.0.1:43210/00000000-0000-4000-8000-000000000001/player.html',
  } as const;
  vi.spyOn(youtubePlayerApi, 'available').mockReturnValue(true);
  vi.spyOn(youtubePlayerApi, 'open').mockResolvedValue(session);
  vi.spyOn(youtubePlayerApi, 'close').mockResolvedValue();
  const view = render(<BackingPage locked={false} />);
  fireEvent.click(
    screen.getByRole('checkbox', { name: '재생 상태·시간 확인 (검증)' }),
  );
  expect(youtubePlayerApi.open).not.toHaveBeenCalled();
  await act(async () => undefined);
  open();
  await waitFor(() =>
    expect(frame()?.getAttribute('src')).toBe(session.frameUrl),
  );
  fireEvent.load(frame()!);
  expect(screen.getByText(/공식 API 준비 대기/)).toBeTruthy();
  const iframe = frame();
  if (!(iframe instanceof HTMLIFrameElement))
    throw new Error('소유 iframe 누락');
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'http://127.0.0.1:43210',
        source: iframe.contentWindow,
        data: {
          schemaVersion: 2,
          type: 'YOUTUBE_SNAPSHOT',
          sessionId: session.sessionId,
          videoId: session.videoId,
          sequence: 1,
          ready: true,
          state: 1,
          currentTimeMs: 1234,
          durationMs: 9000,
          playbackRate: 1,
          errorCode: null,
        },
      }),
    ),
  );
  expect(screen.getByText(/재생 중 · 1.2 \/ 9.0초 · 1×/)).toBeTruthy();
  const control = vi.spyOn(iframe.contentWindow!, 'postMessage');
  act(() => blur());
  expect(frame()).toBe(iframe);
  expect(control).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'YOUTUBE_PAUSE', requestId: 1 }),
    'http://127.0.0.1:43210',
  );
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe.contentWindow,
        origin: 'http://127.0.0.1:43210',
        data: {
          schemaVersion: 1,
          type: 'YOUTUBE_PAUSED',
          sessionId: session.sessionId,
          videoId: session.videoId,
          requestId: 1,
        },
      }),
    ),
  );
  viewport(1);
  expect(frame()).toBe(iframe);
  expect(youtubePlayerApi.close).not.toHaveBeenCalled();
  viewport(0);
  expect(frame()).toBe(iframe);
  expect(control).toHaveBeenLastCalledWith(
    expect.objectContaining({ requestId: 2 }),
    'http://127.0.0.1:43210',
  );
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe.contentWindow,
        origin: 'http://127.0.0.1:43210',
        data: {
          schemaVersion: 1,
          type: 'YOUTUBE_PAUSED',
          sessionId: session.sessionId,
          videoId: session.videoId,
          requestId: 2,
        },
      }),
    ),
  );
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  expect(frame()).toBe(iframe);
  expect(control).toHaveBeenLastCalledWith(
    expect.objectContaining({ requestId: 3 }),
    'http://127.0.0.1:43210',
  );
  visibility.mockRestore();
  expect(
    control.mock.calls.every(([message]) => message.type === 'YOUTUBE_PAUSE'),
  ).toBe(true);
  view.unmount();
  expect(youtubePlayerApi.close).toHaveBeenCalledWith(session.sessionId);
});

it('저장 주소를 불러오거나 저장해도 연결하지 않고 명시적 열기 뒤에만 iframe을 만든다', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const selection = {
    kind: 'YOUTUBE_EMBED',
    videoId: 'Ab_cD-12345',
    selectedByUser: true,
  } as const;
  vi.spyOn(projectBackingApi, 'available').mockReturnValue(true);
  vi.spyOn(projectBackingApi, 'load').mockResolvedValue({
    schemaVersion: 1,
    projectId: id,
    selection,
  });
  vi.spyOn(projectBackingApi, 'save').mockImplementation(
    async (value) => value,
  );
  render(
    <BackingPage locked={false} projectId={id} projectTitle="자체 테스트" />,
  );
  expect(projectBackingApi.load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '저장 주소 다시 읽기' }));
  await screen.findByText(/저장 주소를 읽었습니다/);
  expect(screen.getByRole('textbox')).toHaveProperty(
    'value',
    'https://www.youtube.com/watch?v=Ab_cD-12345',
  );
  expect(frame()).toBeNull();
  expect(native.pause).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '영상 주소 저장' }));
  await screen.findByText(/영상 ID를 프로젝트에 저장/);
  expect(frame()).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: '안내에 동의하고 YouTube 열기' }),
  );
  expect(frame()).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '저장 주소 삭제' }));
  await screen.findByText(/프로젝트의 저장 주소를 삭제/);
  expect(frame()).toBeTruthy();
});

it('명시적 안내 동의 버튼 클릭 전에는 연결하지 않고 로컬 재생을 먼저 멈춘다', () => {
  const view = render(<BackingPage locked={false} />);
  expect(frame()).toBeNull();
  expect(
    screen.getByRole('button', { name: '안내에 동의하고 YouTube 열기' }),
  ).toHaveProperty('disabled', true);
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'https://youtu.be/Ab_cD-12345' },
  });
  expect(frame()).toBeNull();
  expect(native.pause).not.toHaveBeenCalled();
  expect(screen.getByText(/영상 ID·IP 등 접속 정보가 전달/)).toBeTruthy();
  open();
  expect(native.pause).toHaveBeenCalledOnce();
  expect(frame()?.getAttribute('src')).toBe(
    'https://www.youtube.com/embed/Ab_cD-12345?autoplay=0&controls=1&playsinline=1',
  );
  expect(frame()?.getAttribute('referrerpolicy')).toBe(
    'strict-origin-when-cross-origin',
  );
  expect(frame()?.getAttribute('sandbox')).not.toMatch(/allow-top-navigation/);
  expect(view.container.querySelector('script,audio,video')).toBeNull();
  fireEvent.load(frame()!);
  expect(screen.getByText(/문서 요청 완료/)).toBeTruthy();
  expect(screen.getByText(/재생 가능 여부는 영상 안/)).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'https://evil.invalid' },
  });
  expect(frame()).toBeNull();
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  fireEvent.click(
    screen.getByRole('button', { name: '안내에 동의하고 YouTube 열기' }),
  );
  expect(screen.getByRole('alert').textContent).toContain('유효한 HTTPS');
  expect(native.pause).toHaveBeenCalledOnce();
});
it('화면 밖·숨김·오프라인·취소·페이지 이탈 후 자동 복귀하지 않는다', () => {
  const view = render(<BackingPage locked={false} />);
  open();
  viewport(0);
  expect(frame()).toBeNull();
  viewport(1);
  expect(frame()).toBeNull();
  open();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  expect(frame()).toBeNull();
  vi.restoreAllMocks();
  open();
  fireEvent(window, new Event('offline'));
  expect(frame()).toBeNull();
  open();
  fireEvent.click(screen.getByRole('button', { name: '온라인 플레이어 닫기' }));
  expect(frame()).toBeNull();
  open();
  fireEvent(window, new Event('pagehide'));
  expect(frame()).toBeNull();
  open();
  view.unmount();
  expect(document.querySelector('iframe')).toBeNull();
  expect(disconnect).toHaveBeenCalledOnce();
});
it('REC 잠금·연결 실패·타임아웃은 iframe을 제거하고 복귀 경로를 유지한다', () => {
  const view = render(<BackingPage locked={true} />);
  expect(screen.getByRole('textbox')).toHaveProperty('disabled', true);
  expect(frame()).toBeNull();
  view.rerender(<BackingPage locked={false} />);
  open();
  fireEvent.error(frame()!);
  expect(frame()).toBeNull();
  vi.useFakeTimers();
  open();
  act(() => vi.advanceTimersByTime(15000));
  expect(frame()).toBeNull();
  expect(screen.getByText(/플레이어 연결을 확인하지/)).toBeTruthy();
  open();
  view.rerender(<BackingPage locked={true} />);
  expect(frame()).toBeNull();
  expect(
    screen.getByRole('link', { name: '연주 화면' }).getAttribute('href'),
  ).toBe('#/performance');
});
it('네이티브 창 비활성화에서 제거하고 늦게 연결된 listener도 해제한다', async () => {
  native.enabled = true;
  let blur: () => void = () => undefined;
  const unlisten = vi.fn();
  native.listen.mockImplementation((_name, callback: () => void) => {
    blur = callback;
    return Promise.resolve(unlisten);
  });
  const view = render(<BackingPage locked={false} />);
  await waitFor(() =>
    expect(native.listen).toHaveBeenCalledWith(
      'tauri://blur',
      expect.any(Function),
    ),
  );
  await act(async () => undefined);
  open();
  expect(frame()).toBeTruthy();
  act(() => blur());
  expect(frame()).toBeNull();
  view.unmount();
  await waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
  let finish: (value: () => void) => void = () => undefined;
  native.listen.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const next = render(<BackingPage locked={false} />);
  next.unmount();
  await act(async () => finish(unlisten));
  expect(unlisten).toHaveBeenCalledTimes(2);
});
it('창 상태 listener 실패 시 열기를 막고 원문 대신 고정 진단만 기록한다', async () => {
  native.enabled = true;
  native.listen.mockRejectedValue(new Error('개인 경로'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<BackingPage locked={false} />);
  await screen.findByRole('alert');
  open();
  expect(frame()).toBeNull();
  expect(native.pause).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('창 상태 안내 연결');
  expect(warn).toHaveBeenCalledWith('[GuitarLab]', 'BACKING_LISTENER_FAILED');
});
