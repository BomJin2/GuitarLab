import { useEffect, useRef, useState } from 'react';
import { logDiagnostic } from '../../shared/logger';
import type { YoutubeSelection } from './youtube';
import {
  receiveYoutubeSnapshot,
  isYoutubePauseAcknowledgement,
  youtubePlayerApi,
  type YoutubeSession,
  type YoutubeSnapshot,
} from './youtubePlayer';

export function useYoutubePlayer(
  selection: YoutubeSelection | null,
  enabled: boolean,
  pauseRequest = 0,
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [session, setSession] = useState<YoutubeSession | null>(null);
  const [snapshot, setSnapshot] = useState<YoutubeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pausing, setPausing] = useState(false);
  const requestPause = useRef<((requestId: number) => void) | null>(null);
  useEffect(() => {
    setSession(null);
    setSnapshot(null);
    setError(null);
    setStale(false);
    setPausing(false);
    if (!selection || !enabled) return;
    let canceled = false;
    let ended = false;
    let owned: YoutubeSession | null = null;
    let sequence = 0;
    let received = 0;
    let ready = false;
    let pendingPause: number | null = null;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    const started = performance.now();
    const close = () => {
      const current = owned;
      owned = null;
      if (current)
        void youtubePlayerApi
          .close(current.sessionId)
          .catch(() => logDiagnostic('warn', 'YOUTUBE_SESSION_CLOSE_FAILED'));
    };
    const fail = (message: string) => {
      if (canceled || ended) return;
      ended = true;
      setError(message);
      setSession(null);
      setSnapshot(null);
      setPausing(false);
      clearInterval(timer);
      clearTimeout(pauseTimer);
      close();
    };
    const message = (event: MessageEvent<unknown>) => {
      if (canceled || ended || !owned) return;
      if (
        pendingPause &&
        isYoutubePauseAcknowledgement(
          event,
          frame.current?.contentWindow ?? null,
          owned,
          pendingPause,
        )
      ) {
        pendingPause = null;
        clearTimeout(pauseTimer);
        setPausing(false);
        return;
      }
      const next = receiveYoutubeSnapshot(
        event,
        frame.current?.contentWindow ?? null,
        owned,
        sequence,
      );
      if (!next) return;
      sequence = next.sequence;
      received = performance.now();
      ready = next.ready;
      if (next.errorCode !== null) {
        fail(
          `YouTube 오류 ${next.errorCode} · 닫고 수동 플레이어나 로컬 반주를 사용하세요.`,
        );
        return;
      }
      setSnapshot(next);
      setStale(false);
    };
    window.addEventListener('message', message);
    const timer = setInterval(() => {
      const now = performance.now();
      if (!ready && now - started >= 15000)
        fail(
          '공식 API 연결을 확인하지 못했습니다. 닫고 수동 플레이어나 로컬 반주를 사용하세요.',
        );
      else if (ready) setStale(now - received > 3000);
    }, 500);
    requestPause.current = (requestId) => {
      const target = frame.current?.contentWindow;
      if (!owned || !target || canceled || ended) return;
      pendingPause = requestId;
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(
        () =>
          fail(
            '일시정지를 확인하지 못해 온라인 플레이어를 닫았습니다. 다시 열어주세요.',
          ),
        1500,
      );
      setPausing(true);
      target.postMessage(
        {
          schemaVersion: 1,
          type: 'YOUTUBE_PAUSE',
          sessionId: owned.sessionId,
          videoId: owned.videoId,
          requestId,
        },
        new URL(owned.frameUrl).origin,
      );
    };
    void youtubePlayerApi
      .open(selection.videoId)
      .then((value) => {
        owned = value;
        if (canceled || ended) {
          close();
          return;
        }
        setSession(value);
      })
      .catch(() =>
        fail(
          '온라인 상태 확인을 시작하지 못했습니다. 이전 연결을 닫고 다시 열거나 수동 플레이어를 사용하세요.',
        ),
      );
    return () => {
      canceled = true;
      requestPause.current = null;
      clearInterval(timer);
      clearTimeout(pauseTimer);
      window.removeEventListener('message', message);
      close();
    };
  }, [selection, enabled]);
  useEffect(() => {
    if (pauseRequest > 0 && session) requestPause.current?.(pauseRequest);
  }, [pauseRequest, session]);
  return { frame, session, snapshot, error, stale, pausing };
}
