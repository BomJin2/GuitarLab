import type { AudioInputController } from './useAudioInput';
import type { MonitorFx } from '../performance/FxRack';
import { useInputMonitor } from './useInputMonitor';
import { useMonitorPlugin } from './useMonitorPlugin';

/** 모니터·AmpliTube 상태를 앱이 함께 쓰도록 바깥에서 만들어 넘깁니다(하단 믹서 FX 랙). */
export function useMonitorFx(
  input: AudioInputController,
  startBlocked: boolean,
  projectId?: string,
): MonitorFx {
  const monitor = useInputMonitor(
    input.native,
    input.state.state === 'RUNNING' ? input.state.streamGeneration : null,
    startBlocked,
  );
  return {
    monitor,
    plugin: useMonitorPlugin(input.native, projectId, monitor.state.state),
  };
}
