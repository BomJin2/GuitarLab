import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScoreSession } from '../score/scoreSession';
import { getActiveTrackIndex } from '../score/trackSelection';
import type { AudioInputController } from './useAudioInput';
import type { ClockState } from '../player/useCaptureClock';
import type { CalibrationController } from '../settings/useCalibration';
import {
  currentProfile,
  type MonitorEnvironment,
} from '../settings/calibration';
import { usePlayer } from '../player/usePlayer';
import { logDiagnostic } from '../../shared/logger';
import {
  buildPracticeTargets,
  difficultySettings,
  practiceApi,
  practiceError,
  validJudgementSettings,
  type AttemptSnapshot,
  type JudgementSettings,
  type StartAttemptRequest,
} from './practice';

export function usePractice(
  session: ScoreSession | null,
  input: AudioInputController,
  clock: ClockState,
  calibration: CalibrationController,
  enabled: boolean,
  savedContext?: ScoreSession['savedRevision'],
) {
  const { engine, state } = usePlayer();
  const [armed, setArmed] = useState(false);
  const [activation, setActivation] = useState(0);
  const [environment, setEnvironment] =
    useState<MonitorEnvironment>('HEADPHONES');
  const [settings, setSettings] = useState<JudgementSettings>(
    difficultySettings.Normal,
  );
  const [snapshot, setSnapshot] = useState<AttemptSnapshot | null>(null);
  const [history, setHistory] = useState<AttemptSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const revision = useMemo(
    () =>
      session?.document
        ? savedContext?.document === session.document
          ? savedContext.revisionId
          : crypto.randomUUID()
        : '',
    [session?.document, savedContext],
  );
  const targets = useMemo(() => {
    if (!session) return [];
    try {
      return buildPracticeTargets(
        session.document,
        getActiveTrackIndex(session),
        state.durationMs,
        state.loop,
      );
    } catch {
      return [];
    }
  }, [session, state.durationMs, state.loop]);
  const profile = currentProfile(
    calibration.document,
    input.state,
    environment,
  );
  const archiveSession = useMemo(
    () => ({
      id: crypto.randomUUID(),
      activation,
      settings,
      environment,
      profileId: profile?.id,
      calibrationRevision: calibration.document.revision,
      revision,
      rate: state.rate,
      targets,
    }),
    [
      activation,
      settings,
      environment,
      profile?.id,
      calibration.document.revision,
      revision,
      state.rate,
      targets,
    ],
  );
  const archiveSessionId = archiveSession.id;
  const unavailable = !input.native
    ? '채점은 데스크톱 앱에서 사용할 수 있습니다.'
    : !enabled
      ? '연습 또는 연주 화면에서 채점을 시작하세요.'
      : input.state.state !== 'RUNNING'
        ? '선택한 기타 입력을 먼저 시작하세요.'
        : !profile
          ? '현재 입력·모니터 환경의 보정값을 먼저 저장하세요.'
          : !validJudgementSettings(settings)
            ? '허용 오차 범위를 확인하세요. GOOD은 COOL 이상이어야 합니다.'
            : !targets.length
              ? '음원 구간에 해당하는 악보 공격 음표가 필요합니다.'
              : null;
  const latest = useRef({
    armed,
    activation,
    enabled,
    unavailable,
    profile,
    environment,
    settings,
    targets,
    revision,
    session,
    input: input.state,
    clock,
    calibrationRevision: calibration.document.revision,
    savedContext,
    archiveSessionId,
  });
  latest.current = {
    armed,
    activation,
    enabled,
    unavailable,
    profile,
    environment,
    settings,
    targets,
    revision,
    session,
    input: input.state,
    clock,
    calibrationRevision: calibration.document.revision,
    savedContext,
    archiveSessionId,
  };
  useEffect(() => {
    let canceled = false;
    let timer: number | undefined;
    let current: {
      key: string;
      snapshot: AttemptSnapshot;
      stopping: boolean;
    } | null = null;
    let stopJob: Promise<void> | null = null;
    let finishedKey: string | null = null;
    let failedKey: string | null = null;
    function publish(next: AttemptSnapshot) {
      if (!canceled) setSnapshot(next);
    }
    function remember(next: AttemptSnapshot) {
      if (!canceled)
        setHistory((previous) =>
          [
            ...previous.filter((item) => item.attemptId !== next.attemptId),
            next,
          ].slice(-20),
        );
    }
    function desired() {
      const value = latest.current;
      const playback = engine.readClock();
      const track = value.session
        ? value.session.document.tracks[getActiveTrackIndex(value.session)]
        : undefined;
      if (
        !value.armed ||
        value.unavailable ||
        value.clock.status !== 'READY' ||
        !playback.playing ||
        !value.profile ||
        !track
      )
        return null;
      const request: StartAttemptRequest = {
        schemaVersion: 1,
        expectedStreamGeneration: value.input.streamGeneration,
        playbackEpoch: playback.playbackEpoch,
        rate: playback.rate,
        scoreRevision: value.revision,
        trackId: track.id,
        calibrationRevision: value.calibrationRevision,
        calibrationProfileId: value.profile.id,
        monitorEnvironment: value.environment,
        ...value.settings,
        targets: value.targets,
        ...(value.savedContext &&
        value.savedContext.document === value.session?.document
          ? {
              archive: {
                projectId: value.savedContext.projectId,
                sessionId: value.archiveSessionId,
                rangeStartMs: engine.getSnapshot().loop?.startMs ?? 0,
                rangeEndMs:
                  engine.getSnapshot().loop?.endMs ??
                  engine.getSnapshot().durationMs,
              },
            }
          : {}),
      };
      const key = JSON.stringify([
        value.activation,
        request.expectedStreamGeneration,
        request.playbackEpoch,
        request.rate,
        request.scoreRevision,
        request.trackId,
        request.calibrationRevision,
        request.calibrationProfileId,
        value.environment,
        value.settings,
        engine.getSnapshot().loop,
        request.archive,
      ]);
      return { key, request };
    }
    async function stopCurrent() {
      if (stopJob) return stopJob;
      if (!current) return;
      const previous = current;
      previous.stopping = true;
      const job = practiceApi
        .stop(previous.snapshot.attemptId)
        .then((stopped) => {
          if (current === previous) current = null;
          publish(stopped);
          remember(stopped);
        });
      stopJob = job;
      try {
        await job;
      } finally {
        if (stopJob === job) stopJob = null;
      }
    }
    async function tick() {
      try {
        let next = desired();
        if (current && (current.stopping || !next || next.key !== current.key))
          await stopCurrent();
        if (canceled) return;
        next = desired();
        if (!next) {
          // 사용자가 다시 시작하거나 clock이 다시 준비될 때만 실패 재시도를 허용합니다.
          failedKey = null;
        } else if (
          !current &&
          next.key !== finishedKey &&
          next.key !== failedKey
        ) {
          try {
            const started = await practiceApi.start(next.request);
            current = { key: next.key, snapshot: started, stopping: false };
            if (canceled || desired()?.key !== next.key) {
              await stopCurrent();
              return;
            }
            publish(started);
            setError(null);
          } catch (cause) {
            failedKey = next.key;
            throw cause;
          }
        }
        if (current) {
          const active = current;
          const result =
            active.snapshot.state === 'RUNNING'
              ? await practiceApi.poll(active.snapshot.attemptId)
              : active.snapshot;
          active.snapshot = result;
          if (canceled || desired()?.key !== active.key) {
            await stopCurrent();
            return;
          }
          publish(result);
          if (result.state !== 'RUNNING') {
            remember(result);
            if (result.state === 'FINISHED') finishedKey = active.key;
            else {
              failedKey = active.key;
              setError(practiceError({ code: result.errorCode }));
            }
            current = null;
          }
        }
      } catch (cause) {
        if (!canceled) setError(practiceError(cause));
        try {
          if (current && !current.stopping) await stopCurrent();
        } catch {
          logDiagnostic('warn', 'PRACTICE_CLEANUP_FAILED');
        }
      } finally {
        if (canceled) {
          try {
            await stopCurrent();
          } catch {
            logDiagnostic('warn', 'PRACTICE_CLEANUP_FAILED');
          }
        } else timer = window.setTimeout(() => void tick(), 200);
      }
    }
    void tick();
    return () => {
      canceled = true;
      window.clearTimeout(timer);
      void stopCurrent().catch(() =>
        logDiagnostic('warn', 'PRACTICE_CLEANUP_FAILED'),
      );
    };
  }, [engine]);
  const waiting = !armed
    ? snapshot?.state === 'RUNNING'
      ? '채점 중단 처리 중'
      : '채점 꺼짐'
    : (unavailable ??
      (state.status === 'countIn'
        ? `준비 ${Math.ceil(state.countInRemainingMs / 1000)}초 · 준비 중에는 채점하지 않습니다.`
        : state.status !== 'playing'
          ? '재생을 기다립니다. 중단한 시도는 별도로 보존합니다.'
          : clock.status !== 'READY'
            ? '시간 동기화를 기다립니다. 준비 전 음표는 감점에서 제외합니다.'
            : error
              ? '시도 중단 · 채점 중단 후 입력·보정값을 확인하고 다시 시작하세요.'
              : snapshot?.state === 'FINISHED'
                ? '이번 시도 완료 · 다시 재생하거나 탐색하면 새 시도를 시작합니다.'
                : '단음 채점 활성'));
  return {
    armed,
    snapshot,
    history,
    error,
    waiting,
    unavailable,
    persistent: Boolean(
      savedContext && session?.document === savedContext.document,
    ),
    environment,
    setEnvironment,
    settings,
    setSettings,
    start: () => {
      if (!unavailable) {
        setError(null);
        setActivation((value) => value + 1);
        setArmed(true);
      }
    },
    stop: () => setArmed(false),
  };
}
export type PracticeController = ReturnType<typeof usePractice>;
