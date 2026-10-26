import { useLayoutEffect, useState } from 'react';
import type { AudioSnapshot } from './audioInput';

export function useInputSelection(state: AudioSnapshot) {
  const [selection, setSelection] = useState(() => ({
    deviceId: state.deviceId ?? '',
    channelIndex: state.channelIndex,
    gate: state.noiseGateDbfs,
  }));
  const active = state.state === 'STARTING' || state.state === 'RUNNING';
  useLayoutEffect(() => {
    if (!active || !state.deviceId) return;
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
  return {
    ...selection,
    selectDevice: (deviceId: string) =>
      setSelection((previous) => ({ ...previous, deviceId, channelIndex: 0 })),
    selectChannel: (channelIndex: number) =>
      setSelection((previous) => ({ ...previous, channelIndex })),
    setGate: (gate: number) =>
      setSelection((previous) => ({ ...previous, gate })),
  };
}
