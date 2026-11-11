import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  decodeInputMonitor,
  emptyInputMonitor,
  inputMonitorApi,
  monitorLatencyEstimateMs,
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
    { insertBypassed: 'yes' },
    { insertDroppedFrames: -1 },
    { insertErrorBlocks: 1.5 },
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
  await inputMonitorApi.bypass(3, true);
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
    [
      'set_input_monitor_bypass',
      { request: { schemaVersion: 1, sessionId: 3, bypassed: true } },
    ],
    ['stop_input_monitor', { request: { schemaVersion: 1 } }],
  ]);
});

it('삽입 처리 v1 선택 필드는 없어도 되고, 있으면 값을 검사하며 지연은 구성 추정으로만 계산한다', () => {
  const running = {
    ...emptyInputMonitor,
    state: 'RUNNING' as const,
    sessionId: 1,
    inputGeneration: 1,
    outputDeviceId: 'out',
    outputName: 'SSL',
    sampleRate: 48000,
    channels: 2,
    bufferFrames: 480,
  };
  // 구버전 응답(선택 필드 없음)은 그대로 받고 추정값은 만들지 않습니다.
  expect(decodeInputMonitor(running).insert).toBeUndefined();
  expect(monitorLatencyEstimateMs(running)).toBeNull();
  const current = {
    ...running,
    insert: 'DRY' as const,
    queueTargetFrames: 960,
    insertLatencyFrames: 7,
  };
  expect(decodeInputMonitor(current).queueTargetFrames).toBe(960);
  expect(monitorLatencyEstimateMs(current)).toBeCloseTo(
    ((960 + 480 + 7) * 1000) / 48000,
  );
  expect(monitorLatencyEstimateMs({ ...current, state: 'STOPPED' })).toBeNull();
  expect(
    monitorLatencyEstimateMs({ ...current, bufferFrames: null }),
  ).toBeNull();
  for (const update of [
    { insert: 'VST3' },
    { queueTargetFrames: -1 },
    { queueTargetFrames: 19201 },
    { insertLatencyFrames: 1.5 },
  ]) {
    expect(() => decodeInputMonitor({ ...current, ...update })).toThrow(
      'MONITOR_CONTRACT_INVALID',
    );
  }
});
