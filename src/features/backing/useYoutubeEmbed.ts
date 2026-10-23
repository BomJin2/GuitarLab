import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { logDiagnostic } from '../../shared/logger';
import { parseYoutubeUrl, type YoutubeSelection } from './youtube';

export function useYoutubeEmbed(
  locked: boolean,
  pauseLocal: () => void,
  observeApi = false,
) {
  const [url, setUrl] = useState('');
  const [selection, setSelection] = useState<YoutubeSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nativeReady, setNativeReady] = useState(!isTauri());
  const [pauseRequest, setPauseRequest] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const apiMode = useRef(observeApi);
  const openedAt = useRef(0);
  const stop = useCallback((message: string) => {
    setSelection(null);
    setPauseRequest(0);
    setNotice(message);
  }, []);
  const changeUrl = useCallback(
    (value: string) => {
      stop('');
      setError(null);
      setUrl(value);
    },
    [stop],
  );

  useEffect(() => {
    active.current = !!selection;
    apiMode.current = observeApi;
  }, [selection, observeApi]);
  useEffect(() => {
    let canceled = false;
    const suspend = (message: string) => {
      if (!active.current) return;
      if (apiMode.current) {
        setPauseRequest((value) => value + 1);
        setNotice(
          `${message} 일시정지를 요청했습니다. 돌아오면 영상 안의 ▶로 다시 재생하세요.`,
        );
      } else stop(`${message} 온라인 플레이어를 닫았습니다. 다시 열어주세요.`);
    };
    const hidden = () => {
      if (document.visibilityState !== 'visible') suspend('화면이 숨겨져');
    };
    const offline = () =>
      stop('인터넷 연결이 끊겼습니다. 로컬 반주를 사용할 수 있습니다.');
    const leave = () => stop('화면을 떠나 온라인 플레이어를 닫았습니다.');
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('offline', offline);
    window.addEventListener('pagehide', leave);
    const observer =
      typeof IntersectionObserver === 'undefined' ||
      typeof IntersectionObserver.prototype.disconnect !== 'function'
        ? null
        : new IntersectionObserver(
            (entries) => {
              const entry = entries.at(-1);
              const displayed =
                !!entry &&
                entry.isIntersecting &&
                entry.intersectionRatio >= 0.5;
              if (
                !displayed &&
                (!Number.isFinite(entry?.time) ||
                  (entry?.time ?? 0) >= openedAt.current)
              )
                suspend('플레이어가 화면 밖으로 이동해');
            },
            { threshold: [0, 0.5] },
          );
    if (host.current) observer?.observe(host.current);
    if (!observer)
      setEnvironmentError(
        '플레이어 표시 상태를 확인할 수 없는 환경입니다. 로컬 반주를 사용하세요.',
      );
    const subscription = isTauri()
      ? getCurrentWindow()
          .listen('tauri://blur', () => suspend('다른 창으로 전환해'))
          .then((unlisten) => {
            if (!canceled) setNativeReady(true);
            return unlisten;
          })
          .catch(() => {
            if (!canceled)
              setEnvironmentError(
                '창 상태 안내 연결에 실패해 온라인 재생을 사용할 수 없습니다.',
              );
            logDiagnostic('warn', 'BACKING_LISTENER_FAILED');
            return null;
          })
      : null;
    return () => {
      canceled = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('offline', offline);
      window.removeEventListener('pagehide', leave);
      void subscription
        ?.then((unlisten) => unlisten?.())
        .catch(() => logDiagnostic('warn', 'BACKING_LISTENER_REMOVE_FAILED'));
    };
  }, [stop]);
  useEffect(() => {
    if (locked)
      stop('녹음 준비·저장 중에는 온라인 플레이어를 사용할 수 없습니다.');
  }, [locked, stop]);
  useEffect(() => {
    if (!selection || loaded || observeApi) return;
    const timer = setTimeout(
      () =>
        stop(
          '플레이어 연결을 확인하지 못했습니다. 인터넷 상태를 확인하고 다시 열거나 로컬 반주를 사용하세요.',
        ),
      15000,
    );
    return () => clearTimeout(timer);
  }, [selection, loaded, stop, observeApi]);
  return {
    host,
    url,
    selection: locked ? null : selection,
    error: environmentError ?? error,
    notice,
    loaded,
    pauseRequest,
    canOpen:
      url.trim().length > 0 && !locked && nativeReady && !environmentError,
    blockedReason: locked
      ? '녹음 준비·저장을 마친 뒤 열 수 있습니다.'
      : environmentError
        ? environmentError
        : !nativeReady
          ? '창 상태 안내를 연결하고 있습니다…'
          : !url.trim()
            ? 'YouTube 동영상 URL을 입력해주세요.'
            : null,
    changeUrl,
    open() {
      if (locked || !nativeReady || environmentError) return;
      if (document.visibilityState !== 'visible' || !navigator.onLine) {
        stop('인터넷과 화면 표시 상태를 확인하고 다시 열어주세요.');
        return;
      }
      try {
        const selected = parseYoutubeUrl(url);
        pauseLocal();
        openedAt.current = performance.now();
        host.current?.scrollIntoView?.({
          block: 'center',
          behavior: 'instant',
        });
        setError(null);
        setNotice(null);
        setLoaded(false);
        setPauseRequest(0);
        setSelection(selected);
      } catch {
        stop('');
        setError(
          '유효한 HTTPS YouTube 동영상 URL을 입력해주세요. 재생목록만 있는 주소는 지원하지 않습니다.',
        );
      }
    },
    loadedFrame: () => setLoaded(true),
    failedFrame: () =>
      stop(
        '온라인 플레이어를 불러오지 못했습니다. 로컬 반주를 사용하거나 다시 열어주세요.',
      ),
    close: () => stop('온라인 플레이어를 닫았습니다.'),
  };
}
