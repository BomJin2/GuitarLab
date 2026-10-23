import { useEffect, useRef, useState } from 'react';
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
  const [startText, setStartText] = useState('1000');
  const [mode, setMode] = useState<'SPECTRAL' | 'TRACK'>('SPECTRAL');
  const [result, setResult] = useState<
    RecordedPitches | RecordedPitchTrack | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const task = useRef(new LatestTask()),
    epoch = useRef(0),
    operation = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    const current = task.current,
      revision = epoch;
    mounted.current = true;
    revision.current++;
    setResult(null);
    setError(null);
    setJob(null);
    setStartText('1000');
    setMode('SPECTRAL');
    return () => {
      mounted.current = false;
      revision.current++;
      current.cancel();
    };
  }, [take.projectId, take.id]);
  const startMs = startText.trim() === '' ? NaN : Number(startText);
  const native = recordedPitchesApi.available();
  const reason = pitchAnalysisErrorCode(
    take,
    startMs,
    mode === 'TRACK' ? 1000 : 400,
  );
  async function analyze() {
    if (operation.current || reason || !native) return;
    operation.current = true;
    const current = epoch.current;
    setBusy(true);
    setCanceling(false);
    setError(null);
    setJob(null);
    setResult(null);
    const outcome = await task.current.run(async (signal) => {
      const progress = (value: JobSnapshot) => {
        if (mounted.current && epoch.current === current && !signal.aborted)
          setJob(value);
      };
      if (mode === 'TRACK')
        return recordedPitchTrackApi.analyze(take, startMs, signal, progress);
      return recordedPitchesApi.analyze(take, startMs, signal, progress);
    });
    operation.current = false;
    if (!mounted.current) return;
    setBusy(false);
    setCanceling(false);
    if (epoch.current !== current) return;
    if (outcome.status === 'ready') setResult(outcome.value);
    if (outcome.status === 'error')
      setError(recordedPitchesError(outcome.error));
  }
  return {
    startText,
    mode,
    changeMode(value: 'SPECTRAL' | 'TRACK') {
      if (operation.current) return;
      epoch.current++;
      setMode(value);
      setResult(null);
      setError(null);
    },
    result,
    busy,
    canceling,
    error,
    job,
    native,
    reason: reason ? recordedPitchesError(new Error(reason)) : null,
    analyze,
    changeStart(value: string) {
      if (operation.current) return;
      epoch.current++;
      setStartText(value);
      setResult(null);
      setError(null);
    },
    cancel() {
      if (!operation.current) return;
      setCanceling(true);
      task.current.cancel();
    },
  };
}
