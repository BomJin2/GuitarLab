import { useState } from 'react';
import type { RecordingController } from './useRecording';
import type { ProjectController } from '../library/useProjects';
import type { ScoreSession } from '../score/scoreSession';
import type { AudioInputController } from '../practice/useAudioInput';
import type { CalibrationController } from '../settings/useCalibration';
import {
  currentProfile,
  type MonitorEnvironment,
} from '../settings/calibration';
import type { ClockState } from '../player/useCaptureClock';
import { usePlayer } from '../player/usePlayer';
import { getActiveTrackIndex } from '../score/trackSelection';
import type { StartRecordingRequest } from './recordings';
import { RecordingLevelNotice } from './RecordingLevelNotice';
export function RecordingPanel({
  recording,
  project,
  session,
  input,
  calibration,
  clock,
  enabled,
  referenceTakeIds = [],
  mixBusy = false,
  mixReady = true,
}: {
  recording: RecordingController;
  project: ProjectController;
  session: ScoreSession | null;
  input: AudioInputController;
  calibration: CalibrationController;
  clock: ClockState;
  enabled: boolean;
  referenceTakeIds?: string[];
  mixBusy?: boolean;
  mixReady?: boolean;
}) {
  const { engine, state } = usePlayer();
  const [environment, setEnvironment] =
    useState<MonitorEnvironment>('HEADPHONES');
  const [local, setLocal] = useState(true);
  const profile = currentProfile(
    calibration.document,
    input.state,
    environment,
  );
  const unavailable = !input.native
    ? '녹음은 Windows GuitarLab 앱에서 사용할 수 있습니다.'
    : !enabled
      ? '입력 보정을 마친 뒤 연습 또는 연주 화면에서 녹음하세요.'
      : mixBusy
        ? '믹스 파일 작업이 끝날 때까지 기다려주세요.'
        : local && !mixReady
          ? '추가한 테이크의 오버더빙 믹스를 먼저 준비하세요.'
          : project.busy
            ? '프로젝트 작업이 끝날 때까지 기다려주세요.'
            : !project.scoreSaved || !session?.savedRevision
              ? '프로젝트 악보를 저장한 뒤 녹음하세요.'
              : input.state.state !== 'RUNNING'
                ? '환경 설정에서 기타 입력을 시작하세요.'
                : !profile
                  ? '현재 입력 장치와 모니터 환경의 보정값을 저장하거나 다시 읽어주세요.'
                  : local && !project.audioAssetId
                    ? '프로젝트 음원 선택으로 반주를 연결하고 프로젝트를 저장하세요.'
                    : local && state.loop !== null
                      ? '반복을 끈 뒤 로컬 반주를 재생하세요.'
                      : local && state.status === 'countIn'
                        ? '재생 준비 중입니다. 준비 취소 후 REC로 녹음을 예약할 수 있습니다.'
                        : local &&
                            (state.durationMs <= 0 ||
                              !['playing', 'paused'].includes(state.status))
                          ? '프로젝트 반주를 불러온 뒤 REC를 누르세요.'
                          : null;
  const ready = unavailable === null;
  const take = recording.take;
  return (
    <section
      className={`panel recording-panel ${recording.locked ? 'is-recording' : ''}`}
      aria-label="입력 녹음"
    >
      <div className="toolbar">
        <strong>
          {recording.preparing
            ? '녹음 준비 중'
            : recording.locked
              ? '● REC · 입력만 녹음'
              : '입력 녹음'}
        </strong>
        <button
          disabled={!input.native || !ready || recording.locked}
          aria-describedby={
            recording.locked ? undefined : 'recording-readiness'
          }
          onClick={() => {
            if (!session?.savedRevision || !profile || !ready) return;
            const track = session.document.tracks[getActiveTrackIndex(session)];
            if (!track) return;
            if (!local) engine.pause();
            const request: StartRecordingRequest = {
              projectId: session.savedRevision.projectId,
              scoreRevisionId: session.savedRevision.revisionId,
              targetScoreTrackId: track.id,
              expectedStreamGeneration: input.state.streamGeneration,
              monitorEnvironment: environment,
              source: 'INPUT_ONLY',
              ...(local && referenceTakeIds.length ? { referenceTakeIds } : {}),
              transport:
                local && project.audioAssetId
                  ? {
                      playbackEpoch: state.playbackEpoch,
                      rate: state.rate,
                      backingAssetId: project.audioAssetId,
                    }
                  : null,
            };
            if (local && state.status !== 'playing')
              void recording.startPrepared(request);
            else
              void recording.start({
                ...request,
                ...(local && clock.status !== 'READY'
                  ? { deferTransport: true }
                  : {}),
              });
          }}
        >
          ● REC
        </button>
        <button
          disabled={
            !recording.locked ||
            (!recording.preparing && recording.busy) ||
            take?.state === 'FINALIZING'
          }
          onClick={() =>
            recording.preparing
              ? recording.cancelPreparation()
              : void recording.stop()
          }
        >
          {recording.preparing ? '준비 취소' : 'STOP · 녹음 저장'}
        </button>
        <a href="#/recordings" aria-disabled={recording.locked}>
          녹음 다시 듣기
        </a>
        <label>
          모니터 환경
          <select
            value={environment}
            disabled={recording.locked}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'HEADPHONES' || v === 'SPEAKERS' || v === 'OTHER')
                setEnvironment(v);
            }}
          >
            <option value="HEADPHONES">헤드폰</option>
            <option value="SPEAKERS">스피커</option>
            <option value="OTHER">기타</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={local}
            disabled={recording.locked}
            onChange={(e) => setLocal(e.target.checked)}
          />
          로컬 반주에 정렬
        </label>
      </div>
      {!recording.locked && (
        <p id="recording-readiness" role="status">
          {unavailable ??
            (local
              ? state.status === 'playing'
                ? 'REC를 누른 현재 위치부터 녹음합니다. 시간 동기화는 자동 연결합니다.'
                : 'REC를 누르면3초 준비 후 녹음과 반주를 시작합니다.'
              : '무반주 녹음 준비 완료 · REC를 눌러주세요.')}
        </p>
      )}
      <p role="status">
        {take
          ? `${take.state} · ${(take.frames / take.sampleRate).toFixed(2)}초 · ${take.frames.toLocaleString()}프레임 · 누락 ${take.droppedFrames} · peak ${take.peak.toFixed(3)}`
          : '녹음 꺼짐 · REC를 눌러야 파일이 생성됩니다.'}
      </p>
      {take && <RecordingLevelNotice peak={take.peak} />}
      {recording.locked && (
        <>
          <progress
            aria-label="녹음 레벨"
            max={1}
            value={Math.min(1, 10 ** (input.state.levelDbfs / 20))}
          />
          <p>
            프로젝트·입력·탐색·배속·반복 변경이 잠겨 있습니다. STOP 후 저장이
            완료될 때까지 기다려주세요.
          </p>
        </>
      )}
      {!recording.locked && (
        <details>
          <summary>녹음 준비·저장 안내</summary>
          <p>
            악보를 프로젝트에 저장하고 현재 입력의 보정값을 준비하세요. 반주
            정렬은 반복을 끄고 정지 상태에서 REC를 누르면3초 준비 후 시작합니다.
            재생 중에도 현재 위치부터 REC할 수 있습니다. 무반주는 체크를 끄며
            악보 정밀 정렬 없이 기록합니다. 최대10분/256MiB · 협상 샘플레이트
            mono WAV · 저장 위치: 앱 데이터의 프로젝트 recordings 폴더.
          </p>
        </details>
      )}
      {take?.errorCode && (
        <p role="alert">
          테이크 안내: {take.errorCode} · 불완전 테이크는 다시 듣기에서 복구할
          수 있습니다.
        </p>
      )}
      {recording.error && <p role="alert">{recording.error}</p>}
      <small>
        시스템/YouTube 출력은 캡처하지 않습니다. 스피커 소리가 마이크로 유입될
        수 있으므로 헤드폰을 권장합니다. 보정값은 사용자 반응과 출력 지연도
        포함합니다.
      </small>
    </section>
  );
}
