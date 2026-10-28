import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import {
  recordedPitchTrackApi,
  type RecordedPitchTrack,
} from './recordedPitchTrack';
import type { JobSnapshot } from '../library/projects';
import type { RecordedTake } from './recordings';
import {
  pitchAnalysisErrorCode,
  recordedPitchesApi,
  recordedPitchesError,
  type RecordedPitches,
} from './recordedPitches';

export function useRecordedPitches(take: RecordedTake) {
  const { projectId, id, sha256, frames, sampleRate, state } = take;
  const source = useMemo(
    () => ({ projectId, id, sha256, frames, sampleRate, state }),
    [projectId, id, sha256, frames, sampleRate, state],
  );
  const [settings, setSettings] = useState<{
    source: typeof source;
    startText: string;
    mode: 'SPECTRAL' | 'TRACK';
  } | null>(null);
  const startText = settings?.source === source ? settings.startText : '1000';
  const mode = settings?.source === source ? settings.mode : 'SPECTRAL';
  const startMs = startText.trim() === '' ? NaN : Number(startText);
  const reason = pitchAnalysisErrorCode(
    take,
    startMs,
    mode === 'TRACK' ? 1000 : 400,
  );
  const context = useMemo(
    () => ({ source, startText, mode, reason }),
    [source, startText, mode, reason],
  );
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{
    context: typeof context;
    result: RecordedPitches | RecordedPitchTrack | null;
    canceling: boolean;
    error: string | null;
    job: JobSnapshot | null;
  } | null>(null);
  const task = useRef(new LatestTask()),
    operation = useRef<typeof context | null>(null),
    owner = useRef<typeof context | null>(null);
  useLayoutEffect(() => {
    const current = task.current;
    owner.current = context;
    return () => {
      owner.current = null;
      current.cancel();
    };
  }, [context]);
  const currentView = view?.context === context ? view : null;
  const ownsContext = () => owner.current === context;
  const native = recordedPitchesApi.available();
  async function analyze() {
    if (
      !ownsContext() ||
      operation.current ||
      reason ||
      !recordedPitchesApi.available()
    )
      return;
    operation.current = context;
    setBusy(true);
    setView({
      context,
      canceling: false,
      error: null,
      job: null,
      result: null,
    });
    const outcome = await task.current.run(async (signal) => {
      const progress = (value: JobSnapshot) => {
        if (ownsContext() && !signal.aborted)
          setView((current) =>
            current?.context === context ? { ...current, job: value } : current,
          );
      };
      if (mode === 'TRACK')
        return recordedPitchTrackApi.analyze(take, startMs, signal, progress);
      return recordedPitchesApi.analyze(take, startMs, signal, progress);
    });
    operation.current = null;
    if (owner.current) setBusy(false);
    if (!ownsContext()) return;
    setView((current) =>
      current?.context === context
        ? {
            ...current,
            canceling: false,
            result: outcome.status === 'ready' ? outcome.value : null,
            error:
              outcome.status === 'error'
                ? recordedPitchesError(outcome.error)
                : null,
          }
        : current,
    );
  }
  return {
    startText,
    mode,
    changeMode(value: 'SPECTRAL' | 'TRACK') {
      if (!ownsContext() || operation.current || value === mode) return;
      owner.current = null;
      setSettings({ source, startText, mode: value });
    },
    result: currentView?.result ?? null,
    busy,
    canceling: busy && (!currentView || currentView.canceling),
    error: currentView?.error ?? null,
    job: currentView?.job ?? null,
    native,
    reason: reason ? recordedPitchesError(new Error(reason)) : null,
    analyze,
    changeStart(value: string) {
      if (!ownsContext() || operation.current || value === startText) return;
      owner.current = null;
      setSettings({ source, startText: value, mode });
    },
    cancel() {
      if (!ownsContext() || operation.current !== context) return;
      setView((current) =>
        current?.context === context
          ? { ...current, canceling: true }
          : current,
      );
      task.current.cancel();
    },
  };
}
