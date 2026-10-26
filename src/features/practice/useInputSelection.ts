import { useLayoutEffect, useRef, useState } from 'react';
import type { AudioSnapshot, DeviceInfo } from './audioInput';

export function useInputSelection(
  state: AudioSnapshot,
  devices: readonly DeviceInfo[],
) {
  const edited = useRef(false);
  const initialized = useRef(false);
  const [selection, setSelection] = useState(() => ({
    deviceId: state.deviceId ?? '',
    channelIndex: state.channelIndex,
    gate: state.noiseGateDbfs,
  }));
  const active = state.state === 'STARTING' || state.state === 'RUNNING';
  useLayoutEffect(() => {
    if (!state.deviceId || (!active && edited.current)) return;
    initialized.current = true;
    const deviceId = state.deviceId;
    setSelection((previous) =>
      previous.deviceId === deviceId &&
      previous.channelIndex === state.channelIndex &&
      previous.gate === state.noiseGateDbfs
        ? previous
        : {
            deviceId,
            channelIndex: state.channelIndex,
            gate: state.noiseGateDbfs,
          },
    );
  }, [active, state.deviceId, state.channelIndex, state.noiseGateDbfs]);
  useLayoutEffect(() => {
    if (
      initialized.current ||
      edited.current ||
      state.deviceId !== null ||
      active
    )
      return;
    const defaults = devices.filter((device) => device.isDefault === true);
    const device = defaults[0];
    if (defaults.length !== 1 || !device) return;
    initialized.current = true;
    setSelection((previous) => ({
      ...previous,
      deviceId: device.id,
      channelIndex: 0,
    }));
  }, [devices, state.deviceId, active]);
  return {
    ...selection,
    selectDevice: (deviceId: string) => {
      edited.current = true;
      setSelection((previous) => ({ ...previous, deviceId, channelIndex: 0 }));
    },
    selectChannel: (channelIndex: number) => {
      edited.current = true;
      setSelection((previous) => ({ ...previous, channelIndex }));
    },
    setGate: (gate: number) => {
      edited.current = true;
      setSelection((previous) => ({ ...previous, gate }));
    },
  };
}
