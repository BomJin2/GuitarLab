import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calibrationApi,
  calibrationError,
  emptyProfileDocument,
  type MonitorEnvironment,
  type ProfileDocument,
} from './calibration';

export function useCalibration(native: boolean) {
  const [document, setDocument] = useState(emptyProfileDocument);
  const [status, setStatus] = useState<
    'IDLE' | 'LOADING' | 'SAVING' | 'SAVED' | 'ERROR'
  >('IDLE');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const load = useCallback(async () => {
    if (!native || busy.current) return;
    const job = ++generation.current;
    busy.current = true;
    setStatus('LOADING');
    setError(null);
    try {
      const next = await calibrationApi.list();
      if (mounted.current && job === generation.current) {
        setDocument(next);
        setStatus('IDLE');
      }
    } catch (cause) {
      if (mounted.current && job === generation.current) {
        setError(calibrationError(cause));
        setStatus('ERROR');
      }
    } finally {
      if (job === generation.current) busy.current = false;
    }
  }, [native]);
  useEffect(() => {
    const requests = generation;
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      requests.current++;
      busy.current = false;
    };
  }, [load]);
  async function save(
    bias: number,
    environment: MonitorEnvironment,
    expectedStreamGeneration: number,
  ) {
    if (!native || busy.current) return;
    busy.current = true;
    const job = ++generation.current;
    setStatus('SAVING');
    setError(null);
    try {
      const next = await calibrationApi.save(
        document.revision,
        bias,
        environment,
        expectedStreamGeneration,
      );
      if (mounted.current && job === generation.current) {
        setDocument(next);
        setStatus('SAVED');
      }
    } catch (cause) {
      if (mounted.current && job === generation.current) {
        setError(calibrationError(cause));
        setStatus('ERROR');
      }
    } finally {
      if (job === generation.current) busy.current = false;
    }
  }
  const applySaved = useCallback((next: ProfileDocument) => {
    generation.current++;
    busy.current = false;
    if (mounted.current) {
      setDocument(next);
      setStatus('SAVED');
      setError(null);
    }
  }, []);
  return { document, status, error, load, save, applySaved };
}
export type CalibrationController = ReturnType<typeof useCalibration>;
