import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { captureAnchor, decodeInputClock } from '../player/captureClock';
import { decodeClockDiagnostic } from '../player/useCaptureClock';
import { usePlayerEngine } from '../player/usePlayer';
import type { AudioInputController } from '../practice/useAudioInput';
import type { CalibrationController } from './useCalibration';
import type { MonitorEnvironment } from './calibration';
import {
  CalibrationClickClock,
  type CalibrationSignalMode,
} from './CalibrationClickClock';
import { inputMonitorApi } from '../practice/monitoring';
import {
  measurementApi,
  measurementError,
  type MeasurementSnapshot,
} from './calibrationMeasurement';
import { logDiagnostic } from '../../shared/logger';

type Status =
  | 'IDLE'
  | 'SYNCING'
  | 'COLLECTING'
  | 'READY'
  | 'SAVING'
  | 'STOPPING'
  | 'SAVED'
  | 'CANCELED'
  | 'ERROR';
type Run = {
  mode: CalibrationSignalMode;
  clicks: CalibrationClickClock;
  generation: number;
  environment: MonitorEnvironment;
  mediaEpoch: number;
  epoch: number;
  sequence: number;
  measurementId: string | null;
  startedMs: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  canceled: boolean;
  saving: boolean;
  cancelAfterSave: boolean;
};
export function useCalibrationMeasurement(
  input: AudioInputController,
  calibration: CalibrationController,
) {
  const engine = usePlayerEngine();
  const latest = useRef({ input, calibration });
  latest.current = { input, calibration };
  const current = useRef<Run | null>(null);
  const mounted = useRef(false);
  const [status, setStatus] = useState<Status>('IDLE');
  const [mode, setMode] = useState<CalibrationSignalMode>('PLUCK');
  const [snapshot, setSnapshot] = useState<MeasurementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState('보정 대기');
  const active = [
    'SYNCING',
    'COLLECTING',
    'READY',
    'SAVING',
    'STOPPING',
  ].includes(status);
  const finish = useCallback(
    async (
      run: Run,
      next: 'SAVED' | 'CANCELED' | 'ERROR',
      message: string | null = null,
    ) => {
      if (run.canceled) return;
      run.canceled = true;
      clearTimeout(run.timer);
      clearTimeout(run.deadlineTimer);
      if (mounted.current) setStatus('STOPPING');
      const results = await Promise.allSettled([
        run.clicks.stop(),
        run.measurementId
          ? measurementApi.cancel(run.measurementId)
          : Promise.resolve(),
      ]);
      const cleanupFailed = results.some(
        (result) => result.status === 'rejected',
      );
      if (cleanupFailed) logDiagnostic('warn', 'CALIBRATION_CLEANUP_FAILED');
      if (current.current === run) {
        current.current = null;
        if (mounted.current) {
          setStatus(next);
          setError(
            message ??
              (cleanupFailed
                ? '측정 종료에 오류가 있습니다. 입력 상태를 확인하세요.'
                : null),
          );
        }
      }
    },
    [],
  );
  const cancel = useCallback(async () => {
    const run = current.current;
    if (!run) return;
    if (run.saving) {
      run.cancelAfterSave = true;
      return;
    }
    await finish(run, 'CANCELED');
  }, [finish]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const run = current.current;
      if (run) {
        if (run.saving) run.cancelAfterSave = true;
        else void finish(run, 'CANCELED');
      }
    };
  }, [finish]);
  useEffect(() => {
    const run = current.current;
    if (
      run &&
      (input.state.state !== 'RUNNING' ||
        input.state.streamGeneration !== run.generation)
    )
      void cancel();
  }, [input.state.state, input.state.streamGeneration, cancel]);
  useEffect(
    () =>
      engine.subscribe(() => {
        const run = current.current;
        if (!run || run.mediaEpoch === 0) return;
        const player = engine.getSnapshot();
        if (
          player.playbackEpoch !== run.mediaEpoch ||
          player.status === 'playing' ||
          player.status === 'countIn'
        )
          void cancel();
      }),
    [engine, cancel],
  );

  const start = useCallback(
    async (
      environment: MonitorEnvironment,
      mode: CalibrationSignalMode = 'PLUCK',
    ) => {
      const selected = latest.current.input;
      if (
        current.current ||
        !selected.native ||
        selected.state.state !== 'RUNNING'
      )
        return;
      const run: Run = {
        mode,
        clicks: new CalibrationClickClock(),
        generation: selected.state.streamGeneration,
        environment,
        mediaEpoch: 0,
        epoch: 0,
        sequence: 0,
        measurementId: null,
        startedMs: performance.now(),
        timer: undefined,
        deadlineTimer: undefined,
        canceled: false,
        saving: false,
        cancelAfterSave: false,
      };
      current.current = run;
      setMode(mode);
      setStatus('SYNCING');
      setSnapshot(null);
      setError(null);
      setClock('클릭 clock 준비 중');
      run.deadlineTimer = setTimeout(() => {
        if (run.saving) {
          run.cancelAfterSave = true;
          return;
        }
        void finish(
          run,
          'CANCELED',
          '보정 시간이 초과되었습니다. 다시 측정하세요.',
        );
      }, 90000);
      try {
        const checkMonitor = async () => {
          if (mode === 'CABLE') {
            const monitor = await inputMonitorApi.status();
            if (monitor.state !== 'STOPPED')
              throw new Error('CABLE_MONITOR_ACTIVE');
          }
        };
        await checkMonitor();
        if (run.canceled || current.current !== run) return;
        engine.pause();
        run.mediaEpoch = engine.getSnapshot().playbackEpoch;
        const [, native] = await Promise.all([
          run.clicks.start(mode),
          invoke<unknown>('get_audio_clock').then(decodeInputClock),
        ]);
        if (run.canceled) return;
        if (native.streamGeneration !== run.generation)
          throw new Error('INPUT_CHANGED');
        run.epoch = Math.max(native.lastPlaybackEpoch, run.mediaEpoch) + 1;
        if (!Number.isSafeInteger(run.epoch))
          throw new Error('CALIBRATION_CONTRACT_INVALID');
        const pump = async () => {
          if (run.canceled || current.current !== run) return;
          if (run.saving) {
            run.timer = setTimeout(() => void pump(), 200);
            return;
          }
          try {
            await checkMonitor();
            if (run.canceled || current.current !== run) return;
            if (performance.now() - run.startedMs > 90000) {
              await finish(
                run,
                'CANCELED',
                '보정 시간이 초과되었습니다. 다시 측정하세요.',
              );
              return;
            }
            const before = run.clicks.readClock(run.epoch);
            const native = decodeInputClock(
              await invoke<unknown>('get_audio_clock'),
            );
            const after = run.clicks.readClock(run.epoch);
            if (run.canceled) return;
            if (native.streamGeneration !== run.generation)
              throw new Error('INPUT_CHANGED');
            const anchor = captureAnchor(before, after, native);
            run.sequence =
              Math.max(run.sequence, native.lastRequestSequence) + 1;
            if (!Number.isSafeInteger(run.sequence))
              throw new Error('CALIBRATION_CONTRACT_INVALID');
            const diagnostic = decodeClockDiagnostic(
              await invoke<unknown>('update_capture_clock', {
                request: {
                  schemaVersion: 1,
                  streamGeneration: run.generation,
                  playbackEpoch: run.epoch,
                  requestSequence: run.sequence,
                  anchor: anchor
                    ? {
                        monotonicNs: anchor.monotonicNs,
                        songTimeMs: anchor.songTimeMs,
                        rate: 1,
                        uncertaintyRealMs: anchor.uncertaintyRealMs,
                      }
                    : null,
                },
              }),
            );
            if (run.canceled) return;
            if (mounted.current)
              setClock(
                diagnostic.ready
                  ? `보정 동기화 안정 · 최대 잔차 ${diagnostic.maximumResidualRealMs.toFixed(2)} ms`
                  : '보정 시간 동기화 중',
              );
            if (!run.measurementId && diagnostic.ready) {
              const initial = await measurementApi.start(
                run.generation,
                run.epoch,
                run.environment,
              );
              run.measurementId = initial.measurementId;
              if (run.canceled) {
                await measurementApi.cancel(initial.measurementId);
                return;
              }
            }
            if (run.measurementId) {
              const next = await measurementApi.poll(run.measurementId);
              if (run.canceled) return;
              if (next.state === 'CANCELED') {
                await finish(
                  run,
                  'CANCELED',
                  '입력 또는 시간 동기화가 변경되어 측정을 취소했습니다.',
                );
                return;
              }
              if (mounted.current && !run.saving) {
                setSnapshot(next);
                setStatus(next.state === 'READY' ? 'READY' : 'COLLECTING');
              }
            }
          } catch (cause) {
            await finish(run, 'ERROR', measurementError(cause));
            return;
          }
          if (!run.canceled) run.timer = setTimeout(() => void pump(), 200);
        };
        void pump();
      } catch (cause) {
        await finish(run, 'ERROR', measurementError(cause));
      }
    },
    [engine, finish],
  );

  const save = useCallback(async () => {
    const run = current.current;
    if (!run?.measurementId || run.saving || run.canceled) return;
    if (run.mode === 'CABLE') {
      setError('유선 관측값은 기타 연주 보정값으로 저장하지 않습니다.');
      return;
    }
    run.saving = true;
    setStatus('SAVING');
    setError(null);
    try {
      const document = await measurementApi.save(
        run.measurementId,
        latest.current.calibration.document.revision,
      );
      latest.current.calibration.applySaved(document);
      await finish(run, 'SAVED');
    } catch (cause) {
      if (run.cancelAfterSave)
        await finish(
          run,
          'ERROR',
          '저장 응답을 확인하지 못했습니다. 보정값을 다시 읽어 확인하세요.',
        );
      else if (mounted.current && current.current === run) {
        setStatus('READY');
        setError(measurementError(cause));
      }
    } finally {
      run.saving = false;
    }
  }, [finish]);
  return { status, mode, snapshot, error, clock, active, start, cancel, save };
}
export type MeasurementController = ReturnType<
  typeof useCalibrationMeasurement
>;
