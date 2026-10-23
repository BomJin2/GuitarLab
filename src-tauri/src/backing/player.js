(() => {
  'use strict';
  let parentOrigin;
  try { parentOrigin = new URL(document.referrer).origin; } catch { return; }
  if (!['http://tauri.localhost', 'https://tauri.localhost', 'http://127.0.0.1:1420'].includes(parentOrigin) || window.parent === window) return;
  const sessionId = document.querySelector('meta[name="session"]').content;
  const videoId = document.querySelector('meta[name="video"]').content;
  let player, timer, sequence = 0, ready = false, finished = false;
  let pauseRequestId = 0;
  function currentVideoId() {
    try {
      const url = new URL(player.getVideoUrl());
      const id = url.searchParams.get('v');
      return ['https:', 'http:'].includes(url.protocol) && ['www.youtube.com', 'youtube.com'].includes(url.hostname) && !url.username && !url.password && !url.port && url.pathname === '/watch' && url.searchParams.getAll('v').length === 1 && /^[A-Za-z0-9_-]{11}$/.test(id ?? '') ? id : null;
    } catch {
      // 식별 전에는 선택 ID로 대체하지 않고 싱크를 보류합니다.
      return null;
    }
  }
  function send(errorCode = null) {
    if (finished && errorCode === null) return;
    let state = null, currentTimeMs = null, durationMs = null, playbackRate = null, observedVideoId = null;
    if (ready && errorCode === null) {
      try {
        state = player.getPlayerState();
        currentTimeMs = player.getCurrentTime() * 1000;
        durationMs = player.getDuration() * 1000;
        playbackRate = player.getPlaybackRate();
        observedVideoId = currentVideoId();
      } catch { fail('API_FAILED'); return; }
    }
    window.parent.postMessage({ schemaVersion: 2, type: 'YOUTUBE_SNAPSHOT', sessionId, videoId: observedVideoId, sequence: ++sequence, ready: ready && errorCode === null, state, currentTimeMs, durationMs, playbackRate, errorCode }, parentOrigin);
    if (pauseRequestId && ready && errorCode === null && [-1, 0, 2, 5].includes(state)) {
      window.parent.postMessage({ schemaVersion: 1, type: 'YOUTUBE_PAUSED', sessionId, videoId, requestId: pauseRequestId }, parentOrigin);
      pauseRequestId = 0;
    }
  }
  function pause() {
    if (!ready || finished) return;
    try { player.pauseVideo(); send(); } catch { fail('API_FAILED'); }
  }
  window.addEventListener('message', event => {
    const value = event.data;
    if (event.source !== window.parent || event.origin !== parentOrigin || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 5 || value.schemaVersion !== 1 || value.type !== 'YOUTUBE_PAUSE' || value.sessionId !== sessionId || value.videoId !== videoId || !Number.isSafeInteger(value.requestId) || value.requestId < 1) return;
    pauseRequestId = value.requestId;
    pause();
  });
  function fail(code) {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    ready = false;
    const error = document.getElementById('error');
    error.hidden = false;
    error.textContent = 'YouTube 연결 오류: ' + code + '. 닫고 수동 플레이어나 로컬 반주를 사용하세요.';
    send(code);
    if (player) {
      try { player.destroy(); } catch { console.warn('YouTube 플레이어 종료를 확인하지 못했습니다.'); }
    }
  }
  window.onYouTubeIframeAPIReady = () => {
    if (finished) return;
    try {
      player = new window.YT.Player('player', {
        width: '100%', height: '100%', videoId,
        playerVars: { autoplay: 0, controls: 1, playsinline: 1, origin: location.origin, widget_referrer: parentOrigin },
        events: {
          onReady: () => { ready = true; if (pauseRequestId) pause(); else send(); timer = setInterval(() => send(), 200); },
          onStateChange: () => send(),
          onPlaybackRateChange: () => send(),
          onError: event => fail(Number.isInteger(event.data) ? event.data : 'API_FAILED'),
        },
      });
    } catch { fail('API_FAILED'); }
  };
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.onerror = () => fail('SCRIPT_FAILED');
  document.head.append(script);
  window.addEventListener('pagehide', () => { finished = true; clearInterval(timer); if (player) player.destroy(); }, { once: true });
})();
