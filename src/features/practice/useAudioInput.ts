import { useCallback, useEffect, useRef, useState } from 'react';
import {
  audioInput,
  emptyAudioSnapshot,
  inputError,
  type DeviceInfo,
} from './audioInput';

export function useAudioInput() {
  const [state, setState] = useState(emptyAudioSnapshot);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const operation = useRef(false);
  const generation = useRef(0);
  const deviceQuery = useRef(0);
  const native = audioInput.available();
  const loadDevices = useCallback(async () => {
    const ticket = ++deviceQuery.current;
    try {
      const result = await audioInput.devices();
      if (mounted.current && ticket === deviceQuery.current) {
        setDevices(result);
        setDevicesLoaded(true);
      }
    } catch (cause) {
      if (mounted.current && ticket === deviceQuery.current)
        setError(inputError(cause));
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (!native || canceled) return;
      if (!operation.current) {
        const currentGeneration = generation.current;
        try {
          const next = await audioInput.status();
          if (!canceled && currentGeneration === generation.current)
            setState(next);
        } catch (cause) {
          if (!canceled && currentGeneration === generation.current)
            setError(inputError(cause));
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
  useEffect(() => {
    const query = deviceQuery;
    if (native) void loadDevices();
    return () => {
      query.current++;
    };
  }, [native, loadDevices]);
  async function run(action: () => Promise<void>) {
    if (operation.current || !native) return;
    operation.current = true;
    generation.current += 1;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      if (mounted.current) setError(inputError(cause));
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    state,
    devices,
    devicesLoaded,
    busy,
    error,
    native,
    refresh: () => run(loadDevices),
    start: (deviceId: string, channelIndex: number, gate: number) =>
      run(async () => {
        const result = await audioInput.start(deviceId, channelIndex, gate);
        if (mounted.current) setState(result);
      }),
    stop: () =>
      run(async () => {
        const result = await audioInput.stop();
        if (mounted.current) setState(result);
      }),
  };
}
export type AudioInputController = ReturnType<typeof useAudioInput>;
