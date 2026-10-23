import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  decodeInputMonitor,
  emptyInputMonitor,
  inputMonitorApi,
} from './monitoring';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.clearAllMocks());
it('실제 모니터 상태와 버전을 검증하고 잘못된 음량·출력·카운터를 거부한다', () => {
  expect(decodeInputMonitor(emptyInputMonitor).state).toBe('STOPPED');
  for (const update of [
    { schemaVersion: 2 },
    { volume: NaN },
    { volume: 1.1 },
    { queuedFrames: 19201 },
    { underrunFrames: -1 },
    { state: 'RUNNING' },
    { outputName: 'x'.repeat(513) },
  ]) {
    expect(() =>
      decodeInputMonitor({ ...emptyInputMonitor, ...update }),
    ).toThrow('MONITOR_CONTRACT_INVALID');
  }
});
it('시작·음량·중단은 v1 명시 요청이며 REC나 파일 명령을 호출하지 않는다', async () => {
  vi.mocked(invoke).mockResolvedValue(emptyInputMonitor);
  await inputMonitorApi.start(12, 'ssl-output', 0.25);
  await inputMonitorApi.volume(3, 0.3);
  await inputMonitorApi.stop();
  expect(vi.mocked(invoke).mock.calls).toEqual([
    [
      'start_input_monitor',
      {
        request: {
          schemaVersion: 1,
          expectedStreamGeneration: 12,
          outputDeviceId: 'ssl-output',
          volume: 0.25,
        },
      },
    ],
    [
      'set_input_monitor_volume',
      { request: { schemaVersion: 1, sessionId: 3, volume: 0.3 } },
    ],
    ['stop_input_monitor', { request: { schemaVersion: 1 } }],
  ]);
});
