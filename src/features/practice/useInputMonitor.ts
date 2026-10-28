import { useCallback, useEffect, useRef, useState } from 'react';
import { type DeviceInfo } from './audioInput';
import {
  emptyInputMonitor,
  inputMonitorApi,
  monitorError,
  type InputMonitorSnapshot,
} from './monitoring';

export function useInputMonitor(
  native: boolean,
  inputGeneration: number | null = null,
  startBlocked = false,
) {
  const blocked = useRef(startBlocked);
  blocked.current = startBlocked;
  const [state, setState] = useState(emptyInputMonitor);
  const [outputs, setOutputs] = useState<DeviceInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.25);
  const [enabled, setEnabled] = useState(false);
  const [output, setOutput] = useState('');
  const [retry, setRetry] = useState(0);
  const outputQuery = useRef(0);
  const attempted = useRef<string | null>(null);
  const operation = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    if (startBlocked) {
      setEnabled(false);
      attempted.current = null;
    }
  }, [startBlocked]);
  useEffect(() => {
    mounted.current = true;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (!native || canceled) return;
      const current = revision.current;
      if (!operation.current) {
        try {
          const next = await inputMonitorApi.status();
          if (!canceled && current === revision.current) setState(next);
        } catch (cause) {
          if (!canceled && current === revision.current)
            setError(monitorError(cause));
        }
      }
      if (!canceled) timer = setTimeout(() => void poll(), 200);
    }
    void poll();
    return () => {
      mounted.current = false;
      canceled = true;
      clearTimeout(timer);
    };
  }, [native]);
  const loadOutputs = useCallback(async () => {
    const ticket = ++outputQuery.current;
    try {
      const result = await inputMonitorApi.outputs();
      if (mounted.current && ticket === outputQuery.current) {
        setOutputs(result);
        setLoaded(true);
      }
    } catch (cause) {
      if (mounted.current && ticket === outputQuery.current)
        setError(monitorError(cause));
    }
  }, []);
  useEffect(() => {
    const query = outputQuery;
    if (native) void loadOutputs();
    return () => {
      query.current++;
    };
  }, [native, loadOutputs]);
  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (!native || operation.current) return;
      operation.current = true;
      revision.current += 1;
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (cause) {
        if (mounted.current) setError(monitorError(cause));
      } finally {
        operation.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [native],
  );
  useEffect(() => {
    if (
      busy ||
      state.state !== 'RUNNING' ||
      Math.abs(state.volume - volume) < 0.00001
    )
      return;
    const timer = setTimeout(
      () =>
        void run(async () => {
          try {
            const next = await inputMonitorApi.volume(state.sessionId, volume);
            if (mounted.current) setState(next);
          } catch (cause) {
            if (mounted.current)
              setVolume((current) =>
                current === volume ? state.volume : current,
              );
            throw cause;
          }
        }),
      120,
    );
    return () => clearTimeout(timer);
  }, [busy, state.state, state.sessionId, state.volume, volume, run]);
  const update = useCallback(
    async (action: () => Promise<InputMonitorSnapshot>) => {
      const next = await action();
      if (mounted.current) setState(next);
    },
    [],
  );
  const selectedOutput = outputs.some((device) => device.id === output)
    ? output
    : (outputs.find((device) => device.isDefault)?.id ?? '');
  const start = useCallback(
    (generation: number, id: string) => {
      if (blocked.current) return Promise.resolve();
      attempted.current = `${generation}:${id}`;
      setEnabled(true);
      setOutput(id);
      return run(() =>
        update(() => inputMonitorApi.start(generation, id, volume)),
      );
    },
    [run, update, volume],
  );
  useEffect(() => {
    if (
      !native ||
      startBlocked ||
      !enabled ||
      busy ||
      operation.current ||
      !inputGeneration ||
      !selectedOutput ||
      state.state === 'RUNNING'
    )
      return;
    const key = `${inputGeneration}:${selectedOutput}`;
    if (attempted.current !== key) void start(inputGeneration, selectedOutput);
  }, [
    native,
    startBlocked,
    enabled,
    busy,
    inputGeneration,
    selectedOutput,
    state.state,
    start,
    retry,
  ]);
  return {
    state,
    outputs,
    loaded,
    busy,
    error,
    volume,
    enabled,
    selectedOutput,
    selectOutput: (value: string) => {
      if (value === '' || outputs.some((device) => device.id === value)) {
        attempted.current = null;
        setOutput(value);
      }
    },
    enable: () => {
      if (blocked.current) return;
      attempted.current = null;
      setEnabled(true);
    },
    setVolume,
    refresh: () =>
      run(async () => {
        attempted.current = null;
        await loadOutputs();
        if (mounted.current) setRetry((current) => current + 1);
      }),
    start,
    stop: () => {
      setEnabled(false);
      attempted.current = null;
      return run(() => update(() => inputMonitorApi.stop()));
    },
  };
}
