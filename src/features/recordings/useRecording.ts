import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  recordingApi,
  recordingActive,
  recordingError,
  type RecordedTake,
  type StartRecordingRequest,
} from './recordings';
import { logDiagnostic } from '../../shared/logger';
import { usePlayer } from '../player/usePlayer';
export function useRecording(native: boolean) {
  const { engine, state } = usePlayer();
  const [take, setTake] = useState<RecordedTake | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const preparationEpoch = useRef(0);
  const preparingRef = useRef(false);
  const operation = useRef(false);
  const mounted = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const preparationGeneration = preparationEpoch;
    const activePreparation = preparingRef;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = native
      ? listen('recording-close-blocked', () =>
          setError('녹음 STOP과 저장을 마친 뒤 창을 닫아주세요.'),
        ).catch(() => {
          if (!canceled)
            setError(
              '창 닫기 안내 연결을 확인하지 못했습니다. 녹음 STOP과 저장을 마친 뒤 창을 닫아주세요.',
            );
          logDiagnostic('warn', 'RECORDING_LISTENER_FAILED');
          return null;
        })
      : null;
    async function poll() {
      if (canceled || !native) return;
      const epoch = revision.current;
      if (!operation.current) {
        try {
          const result = await recordingApi.status();
          if (!canceled && epoch === revision.current) setTake(result);
        } catch (cause) {
          if (!canceled && epoch === revision.current)
            setError(recordingError(cause));
        }
      }
      if (!canceled) timer = setTimeout(() => void poll(), 200);
    }
    void poll();
    return () => {
      mounted.current = false;
      preparationGeneration.current++;
      if (activePreparation.current) engine.pause();
      canceled = true;
      clearTimeout(timer);
      void subscription
        ?.then((unlisten) => unlisten?.())
        .catch(() => logDiagnostic('warn', 'RECORDING_LISTENER_REMOVE_FAILED'));
    };
  }, [native, engine]);
  const run = useCallback(
    async (action: () => Promise<RecordedTake | null>) => {
      if (!native || operation.current) return;
      operation.current = true;
      revision.current++;
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        if (mounted.current) setTake(result);
      } catch (cause) {
        if (mounted.current) setError(recordingError(cause));
      } finally {
        operation.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [native],
  );
  const cancelPreparation = useCallback(() => {
    preparationEpoch.current++;
    engine.pause();
  }, [engine]);
  const startPrepared = (request: StartRecordingRequest) =>
    run(async () => {
      const transport = request.transport;
      if (!transport) throw new Error('RECORDING_CONTRACT_INVALID');
      const epoch = ++preparationEpoch.current;
      preparingRef.current = true;
      setPreparing(true);
      const pending: { take: RecordedTake | null; error: unknown } = {
        take: null,
        error: null,
      };
      try {
        if (engine.getSnapshot().audioTimeMs >= engine.getSnapshot().durationMs)
          engine.seek(0);
        await engine.prepare(async () => {
          if (!mounted.current || epoch !== preparationEpoch.current)
            return false;
          try {
            pending.take = await recordingApi.start({
              ...request,
              deferTransport: true,
              transport: {
                ...transport,
                playbackEpoch: engine.getSnapshot().playbackEpoch,
              },
            });
            if (mounted.current) setTake(pending.take);
            if (!pending.take || !recordingActive(pending.take))
              throw new Error('RECORDING_PLAYBACK_FAILED');
            return mounted.current && epoch === preparationEpoch.current;
          } catch (cause) {
            pending.error = cause;
            return false;
          }
        });
        if (pending.error) throw pending.error;
        if (epoch !== preparationEpoch.current || !mounted.current)
          throw new Error('RECORDING_PREPARATION_CANCELED');
        if (engine.getSnapshot().status !== 'playing')
          throw new Error('RECORDING_PLAYBACK_FAILED');
        return pending.take;
      } catch (cause) {
        engine.pause();
        // 취소 뒤 늦게 열린 입력 기록도 중단하고 원본을 보존합니다.
        if (pending.take && recordingActive(pending.take)) {
          const final = await recordingApi.stop(pending.take.id);
          if (mounted.current) setTake(final);
        }
        throw cause;
      } finally {
        preparingRef.current = false;
        if (mounted.current) setPreparing(false);
      }
    });
  useEffect(() => {
    if (
      take?.transport &&
      recordingActive(take) &&
      state.status === 'paused' &&
      state.durationMs > 0 &&
      state.audioTimeMs >= state.durationMs &&
      !operation.current
    )
      void run(() => recordingApi.stop(take.id));
  }, [take, state.status, state.durationMs, state.audioTimeMs, run]);
  return {
    take,
    busy,
    error,
    preparing,
    startPrepared,
    cancelPreparation,
    locked: busy || recordingActive(take),
    start: (request: StartRecordingRequest) =>
      run(() => recordingApi.start(request)),
    stop: () =>
      take ? run(() => recordingApi.stop(take.id)) : Promise.resolve(),
  };
}
export type RecordingController = ReturnType<typeof useRecording>;
