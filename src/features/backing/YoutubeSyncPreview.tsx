import type { ScoreSession } from '../score/scoreSession';
import { ScoreViewport } from '../score/ScoreViewport';
import type { YoutubeSnapshot } from './youtubePlayer';
import { useYoutubeSync } from './useYoutubeSync';

const statusLabels = {
  UNCONFIGURED: '두 맞춤 지점을 입력하고 임시 적용하세요.',
  WAITING: '영상 준비·관측 복구를 기다립니다. 커서를 숨겼습니다.',
  OUTSIDE: '맞춤 구간 밖입니다. 커서를 숨겼습니다.',
  READY: '수동 맞춤 커서 · BEST_EFFORT',
};
export function YoutubeSyncPreview({
  session,
  videoId,
  snapshot,
  unavailable,
  projectId,
  scoreSaved = false,
}: {
  session: ScoreSession;
  videoId: string;
  snapshot: YoutubeSnapshot | null;
  unavailable: boolean;
  projectId?: string;
  scoreSaved?: boolean;
}) {
  const sync = useYoutubeSync(
    session,
    videoId,
    snapshot,
    unavailable,
    projectId,
    scoreSaved,
  );
  const { storage } = sync;
  return (
    <section aria-label="영상 수동 싱크 미리보기">
      <h2>영상·TAB 맞추기</h2>
      <p>{sync.trackName} · 점수·녹음 없이 읽기 전용으로 표시합니다.</p>
      <ScoreViewport
        score={session.score}
        lookup={session.playbackLookup}
        trackIndex={sync.trackIndex}
        tick={sync.cursor.tick}
      />
      <p role="status">{statusLabels[sync.cursor.status]}</p>
      <p>
        진행 마디 번호 1~{sync.barCount}는 반복을 펼친 순서입니다.{' '}
        {sync.barCount + 1}은 악보 끝입니다. 영상 안에서 일시정지하면 현재 영상
        시간을 넣을 수 있습니다.
      </p>
      {sync.draft.map((row, index) => (
        <fieldset key={index}>
          <legend>맞춤 지점 {index + 1}</legend>
          <label>
            진행 마디 {index + 1}
            <input
              type="number"
              min={1}
              max={sync.barCount + 1}
              step={1}
              value={row.bar}
              onChange={(event) => {
                sync.update(index, 'bar', event.target.value);
              }}
            />
          </label>
          <label>
            영상 초 {index + 1}
            <input
              type="number"
              min={0}
              step="any"
              value={row.seconds}
              onChange={(event) => {
                sync.update(index, 'seconds', event.target.value);
              }}
            />
          </label>
          <button
            disabled={!sync.canCapture}
            onClick={() => sync.capture(index)}
          >
            현재 영상 시간을 지점 {index + 1}에 넣기
          </button>
        </fieldset>
      ))}
      <button disabled={!sync.available} onClick={sync.apply}>
        두 지점 임시 적용
      </button>
      <button disabled={!sync.profile} onClick={sync.clear}>
        맞춤 해제
      </button>
      {sync.error && <p role="alert">{sync.error}</p>}
      <section aria-label="프로젝트 영상 맞춤 저장">
        <p>
          {sync.hasSavedScore
            ? '현재 프로젝트의 저장 악보·영상·트랙에만 보존합니다.'
            : '프로젝트 악보를 먼저 저장하면 영상 맞춤도 저장할 수 있습니다.'}
        </p>
        <button
          disabled={!storage.available || storage.busy || !sync.profile}
          onClick={sync.save}
        >
          영상 맞춤 저장
        </button>
        <button
          disabled={!storage.available || storage.busy}
          onClick={() => void storage.load()}
        >
          저장 맞춤 다시 읽기
        </button>
        <button
          disabled={!storage.available || storage.busy}
          onClick={() => void storage.clear()}
        >
          저장 맞춤 삭제
        </button>
        <button disabled={!storage.busy} onClick={storage.cancel}>
          맞춤 작업 취소
        </button>
        {storage.busy && (
          <p role="status">
            맞춤 {storage.job?.state === 'CANCELING' ? '취소 처리' : '처리'} 중…
          </p>
        )}
        {storage.error && <p role="alert">{storage.error}</p>}
        {storage.notice && <p role="status">{storage.notice}</p>}
      </section>
      <p>
        두 지점 사이를 선형으로 추정합니다. 템포 변화·광고·버퍼링으로 어긋날 수
        있고 정밀 채점에 사용하지 않습니다. 저장하지 않은 적용은 영상
        닫기·변경·화면 이탈 시 사라집니다. 저장한 맞춤도 같은 영상·악보 버전에서
        다시 읽어야 적용되며 자동 접속·재생하지 않습니다. 원래 로컬 악보 싱크는
        변경하지 않습니다.
      </p>
    </section>
  );
}
