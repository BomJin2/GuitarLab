import { usePlayerEngine } from '../player/usePlayer';
import { useYoutubeEmbed } from './useYoutubeEmbed';
import { youtubeCapability, youtubeEmbedUrl } from './youtube';
import { useProjectBacking } from './useProjectBacking';
import { useState } from 'react';
import { useYoutubePlayer } from './useYoutubePlayer';
import { youtubePlayerApi, youtubeStateLabel } from './youtubePlayer';
import type { ScoreSession } from '../score/scoreSession';
import { YoutubeSyncPreview } from './YoutubeSyncPreview';

export function BackingPage({
  locked,
  projectId,
  projectTitle,
  scoreSession,
  scoreSaved = false,
}: {
  locked: boolean;
  projectId?: string;
  projectTitle?: string;
  scoreSession?: ScoreSession | null;
  scoreSaved?: boolean;
}) {
  const engine = usePlayerEngine();
  const [observeApi, setObserveApi] = useState(false);
  const player = useYoutubeEmbed(locked, () => engine.pause(), observeApi);
  const storage = useProjectBacking(projectId, locked, player.changeUrl);
  const api = useYoutubePlayer(
    player.selection,
    observeApi,
    player.pauseRequest,
  );
  return (
    <section aria-labelledby="backing-title">
      <h1 id="backing-title">반주 찾기</h1>
      <p>
        로컬 반주는 <a href="#/performance">연주 화면</a>에서 사용하세요.
      </p>
      <section className="panel" aria-label="YouTube URL 직접 열기">
        <h2>YouTube 공식 플레이어 · URL 직접 열기</h2>
        <p>
          YouTube에서 사용할 영상을 찾은 뒤 동영상 주소를 붙여넣으세요. API 키
          발급·입력 없이 사용할 수 있습니다. 기타 파트가 빠진 반주인지는 직접
          들어 확인해주세요.
        </p>
        <label>
          YouTube 동영상 URL
          <input
            type="url"
            maxLength={2048}
            value={player.url}
            onChange={(event) => {
              storage.cancel();
              player.changeUrl(event.target.value);
            }}
            disabled={locked}
          />
        </label>
        <section aria-label="프로젝트 영상 주소">
          <p>
            {projectId
              ? `프로젝트: ${projectTitle ?? projectId}`
              : '프로젝트를 열면 영상 주소를 보존할 수 있습니다. 저장 없이 직접 열기도 가능합니다.'}
          </p>
          <button
            disabled={!storage.available || storage.busy || !player.url.trim()}
            onClick={() => void storage.save(player.url)}
          >
            영상 주소 저장
          </button>
          <button
            disabled={!storage.available || storage.busy}
            onClick={() => void storage.load()}
          >
            저장 주소 다시 읽기
          </button>
          <button
            disabled={!storage.available || storage.busy}
            onClick={() => void storage.clear()}
          >
            저장 주소 삭제
          </button>
          <button disabled={!storage.busy} onClick={storage.cancel}>
            주소 작업 취소
          </button>
          {storage.busy && (
            <p role="status">
              주소 작업{' '}
              {storage.job?.state === 'CANCELING' ? '취소 처리 중' : '처리 중'}…
            </p>
          )}
          {storage.stored !== undefined && (
            <p>
              {storage.stored
                ? `저장 영상 ID: ${storage.stored.videoId}`
                : '프로젝트에 저장된 영상 주소가 없습니다.'}
            </p>
          )}
          {storage.error && <p role="alert">{storage.error}</p>}
          {storage.notice && <p role="status">{storage.notice}</p>}
        </section>
        <details id="youtube-privacy">
          <summary>온라인 재생 개인정보 안내</summary>
          <p>
            이 기능은 YouTube 공식 임베드를 사용합니다. 열기 버튼을 누르면 선택
            영상 ID와 IP 등 접속 정보가 YouTube/Google에 전달되며, YouTube는
            자체 정책에 따라 광고를 표시하거나 쿠키·기기 정보를 처리할 수
            있습니다. GuitarLab은 로그인 정보를 요청하지 않습니다.
          </p>
          <p>
            GuitarLab은 영상 ID만 화면 메모리에 유지하며, 영상 주소 저장을
            누르면 현재 프로젝트의 로컬 데이터베이스에도 보존합니다. 저장 주소
            삭제로 보존한 ID를 지울 수 있습니다. 개인 음원·악보·녹음은 전송하지
            않습니다. 온라인 플레이어 닫기로 연결을 종료하고 로컬 연습을 계속할
            수 있습니다.
          </p>
        </details>
        <p>
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            YouTube 이용약관
          </a>{' '}
          ·{' '}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google 개인정보처리방침
          </a>
        </p>
        <button disabled={!player.selection} onClick={player.close}>
          온라인 플레이어 닫기
        </button>
        <label>
          <input
            type="checkbox"
            checked={observeApi}
            disabled={
              !!player.selection || locked || !youtubePlayerApi.available()
            }
            onChange={(event) => setObserveApi(event.target.checked)}
          />
          재생 상태·시간 확인 (검증)
        </label>
        <p>
          인터넷이 필요합니다. API 검증 모드는 화면 밖 이동·다른 창 전환·숨김 시
          일시정지하고 영상을 유지합니다. 중지 확인에 실패하거나 수동 플레이어를
          사용하면 닫습니다. 돌아와도 자동 재생하지 않습니다. 저장 주소를 읽어도
          직접 열기를 다시 눌러야 연결됩니다.
        </p>
        {player.error && <p role="alert">{player.error}</p>}
        {player.notice && <p role="status">{player.notice}</p>}
        <div
          className={
            observeApi && player.selection && scoreSession
              ? 'youtube-score-workspace'
              : undefined
          }
        >
          <div className="youtube-player-host" ref={player.host}>
            {player.selection && observeApi ? (
              api.session ? (
                <iframe
                  ref={api.frame}
                  title="YouTube 공식 동영상 플레이어"
                  src={api.session.frameUrl}
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                  allow="encrypted-media; fullscreen; picture-in-picture 'none'"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                <p>
                  {api.error ? '연결 종료됨' : '격리된 공식 API 연결 준비 중…'}
                </p>
              )
            ) : player.selection ? (
              <iframe
                key={player.selection.videoId}
                title="YouTube 공식 동영상 플레이어"
                src={youtubeEmbedUrl(player.selection)}
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                allow="encrypted-media; fullscreen; picture-in-picture 'none'"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                onLoad={player.loadedFrame}
                ref={(frame) => {
                  if (!frame) return;
                  frame.onerror = player.failedFrame;
                  return () => {
                    frame.onerror = null;
                  };
                }}
              />
            ) : (
              <div>
                <p id="youtube-connection-notice">
                  아래 버튼을 누르면 개인정보 안내와 YouTube 이용약관에 동의하고
                  YouTube에 연결합니다. 영상 ID·IP 등 접속 정보가 전달됩니다.
                </p>
                <button
                  disabled={!player.canOpen}
                  onClick={player.open}
                  aria-describedby="youtube-connection-notice youtube-privacy"
                >
                  안내에 동의하고 YouTube 열기
                </button>
                {player.blockedReason && (
                  <p role="status">{player.blockedReason}</p>
                )}
              </div>
            )}
          </div>
          {observeApi && player.selection && scoreSession && (
            <YoutubeSyncPreview
              key={`${scoreSession.document.id}:${scoreSession.savedRevision?.revisionId}:${scoreSaved}:${scoreSession.activePerformanceTrackId ?? scoreSession.activeTrackIndex}:${player.selection.videoId}`}
              session={scoreSession}
              videoId={player.selection.videoId}
              snapshot={api.snapshot}
              unavailable={api.stale || api.pausing || !!api.error}
              projectId={projectId}
              scoreSaved={scoreSaved}
            />
          )}
        </div>
        {player.selection && !observeApi && (
          <p role="status">
            {player.loaded
              ? '플레이어 문서 요청 완료 · 재생 가능 여부는 영상 안의 안내를 확인하세요.'
              : '공식 플레이어 연결 중…'}
          </p>
        )}
        {player.selection && observeApi && (
          <>
            {api.error && <p role="alert">{api.error}</p>}
            {api.snapshot?.ready &&
              api.snapshot.videoId !== player.selection.videoId && (
                <p role="status">
                  현재 영상 식별이 다르거나 확인 전이므로 수동 싱크를
                  중지했습니다. 사용할 영상 주소로 다시 열어주세요.
                </p>
              )}
            <p role="status">
              {api.pausing
                ? '일시정지 확인 중'
                : api.stale
                  ? '관측 지연 · 현재 상태를 확인할 수 없습니다'
                  : api.error
                    ? '관측 연결 종료'
                    : api.snapshot?.ready
                      ? `${youtubeStateLabel(api.snapshot.state)} · ${((api.snapshot.currentTimeMs ?? 0) / 1000).toFixed(1)} / ${((api.snapshot.durationMs ?? 0) / 1000).toFixed(1)}초 · ${api.snapshot.playbackRate}×`
                      : '공식 API 준비 대기'}{' '}
              · BEST_EFFORT
            </p>
          </>
        )}
        <p>
          비공개·임베드 제한·오류153(앱 식별) 등으로 재생할 수 없다면 닫고 로컬
          반주를 사용하세요. 수동 플레이어의 영상 내부 오류는 직접 확인해야
          합니다.
        </p>
        <p>
          {youtubeCapability.syncPrecision} · 정밀 채점·REC·로컬 믹스 연결은
          지원하지 않습니다. 온라인 영상을 다운로드·분석·파일 출력하지 않습니다.
          API 검증 모드와 열린 악보가 있으면 임시 수동 싱크 미리보기를 사용할 수
          있습니다.
        </p>
      </section>
    </section>
  );
}
