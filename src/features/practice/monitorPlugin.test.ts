import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  decodeMonitorPlugin,
  decodeProjectPluginState,
  pluginNotices,
  pluginOwnershipNotice,
  SLOW_LOAD_SECONDS,
  emptyMonitorPlugin,
  monitorPluginApi,
  monitorPluginMessage,
} from './monitorPlugin';
import { inputMonitorApi, emptyInputMonitor } from './monitoring';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.clearAllMocks());

const ready = {
  ...emptyMonitorPlugin,
  state: 'READY' as const,
  name: 'AmpliTube 5',
  vendor: 'IK Multimedia',
  version: '5.10.4',
  classId: '56535441746235616D706C6974756265',
  sampleRate: 48000,
  latencyFrames: 7,
};
it('플러그인 상태 v1을 검사하고 경로 없는 READY만 받는다', () => {
  expect(decodeMonitorPlugin(emptyMonitorPlugin).state).toBe('NONE');
  expect(decodeMonitorPlugin(ready).name).toBe('AmpliTube 5');
  for (const update of [
    { schemaVersion: 2 },
    { state: 'RUNNING' },
    { inUse: 'no' },
    { editorOpen: 'yes' },
    { editorOpen: undefined },
    { sampleRate: 192001 },
    { latencyFrames: -1 },
    { name: null },
    { name: 'x'.repeat(257) },
  ]) {
    expect(() => decodeMonitorPlugin({ ...ready, ...update })).toThrow(
      'PLUGIN_CONTRACT_INVALID',
    );
  }
});
it('불러오기·해제는 v1 요청이고 모니터 시작은 AMPLITUBE일 때만 insert를 보낸다', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    ...emptyMonitorPlugin,
    state: 'LOADING',
    sampleRate: 48000,
  });
  vi.mocked(invoke).mockResolvedValueOnce(emptyMonitorPlugin);
  await monitorPluginApi.load(48000);
  await monitorPluginApi.unload();
  vi.mocked(invoke).mockResolvedValue(emptyInputMonitor);
  await inputMonitorApi.start(3, 'out', 0.25);
  await inputMonitorApi.start(3, 'out', 0.25, 'AMPLITUBE');
  expect(vi.mocked(invoke).mock.calls).toEqual([
    [
      'load_monitor_plugin',
      { request: { schemaVersion: 1, sampleRate: 48000 } },
    ],
    ['unload_monitor_plugin', { request: { schemaVersion: 1 } }],
    [
      'start_input_monitor',
      {
        request: {
          schemaVersion: 1,
          expectedStreamGeneration: 3,
          outputDeviceId: 'out',
          volume: 0.25,
        },
      },
    ],
    [
      'start_input_monitor',
      {
        request: {
          schemaVersion: 1,
          expectedStreamGeneration: 3,
          outputDeviceId: 'out',
          volume: 0.25,
          insert: 'AMPLITUBE',
        },
      },
    ],
  ]);
});
it('오류 코드는 사용자 문구로 바꾸고 모르는 코드는 일반 문구로 둔다', () => {
  expect(monitorPluginMessage(null)).toBeNull();
  expect(monitorPluginMessage('PLUGIN_NOT_FOUND')).toContain(
    'AmpliTube 5 VST3',
  );
  expect(monitorPluginMessage('PLUGIN_RATE_MISMATCH')).toContain(
    '다시 불러오세요',
  );
  expect(monitorPluginMessage('SOMETHING')).toBe(
    'AmpliTube 작업에 실패했습니다.',
  );
});
it('편집 창 열기·닫기는 v1 요청이고 편집 창 오류도 문구로 바꾼다', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({ ...ready, editorOpen: true });
  vi.mocked(invoke).mockResolvedValueOnce(ready);
  expect((await monitorPluginApi.openEditor()).editorOpen).toBe(true);
  expect((await monitorPluginApi.closeEditor()).editorOpen).toBe(false);
  expect(vi.mocked(invoke).mock.calls).toEqual([
    ['open_monitor_plugin_editor', { request: { schemaVersion: 1 } }],
    ['close_monitor_plugin_editor', { request: { schemaVersion: 1 } }],
  ]);
  expect(monitorPluginMessage('PLUGIN_EDITOR_FAILED')).toContain('편집 창');
});
it('프로젝트 톤은 v1 요약만 받고 저장·불러오기는 프로젝트 ID로 요청한다', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const saved = {
    schemaVersion: 1,
    projectId: id,
    saved: true,
    classId: ready.classId,
    pluginVersion: '5.10.4',
    bytes: 10254,
  };
  const none = {
    ...saved,
    saved: false,
    classId: null,
    pluginVersion: null,
    bytes: null,
  };
  expect(decodeProjectPluginState(saved, id).bytes).toBe(10254);
  expect(decodeProjectPluginState(none, id).saved).toBe(false);
  for (const bad of [
    { ...saved, projectId: 'other' },
    { ...saved, bytes: null },
    { ...none, bytes: 3 },
    { ...saved, bytes: 8 * 1024 * 1024 + 1 },
    { ...saved, schemaVersion: 2 },
  ])
    expect(() => decodeProjectPluginState(bad, id)).toThrow(
      'PLUGIN_CONTRACT_INVALID',
    );
  vi.mocked(invoke).mockResolvedValueOnce(none);
  vi.mocked(invoke).mockResolvedValueOnce(saved);
  vi.mocked(invoke).mockResolvedValueOnce(ready);
  await monitorPluginApi.projectTone(id);
  await monitorPluginApi.saveProjectTone(id);
  await monitorPluginApi.restoreProjectTone(id);
  const request = { request: { schemaVersion: 1, projectId: id } };
  expect(vi.mocked(invoke).mock.calls).toEqual([
    ['get_project_plugin_state', request],
    ['save_project_plugin_state', request],
    ['restore_project_plugin_state', request],
  ]);
  expect(monitorPluginMessage('PLUGIN_STATE_MISMATCH')).toContain(
    '다른 플러그인',
  );
});
it('누락·인증·톤 보존·버전 차이 안내를 상태별로 만들고 인증됨으로 표시하지 않는다', () => {
  const tone = {
    schemaVersion: 1 as const,
    projectId: 'p',
    saved: true,
    classId: ready.classId,
    pluginVersion: '5.10.4',
    bytes: 10,
  };
  const loading = { ...emptyMonitorPlugin, state: 'LOADING' as const };
  expect(pluginNotices(emptyMonitorPlugin, null, 0)).toEqual([]);
  expect(pluginNotices(loading, null, SLOW_LOAD_SECONDS - 1)).toEqual([]);
  expect(pluginNotices(loading, null, SLOW_LOAD_SECONDS)[0]).toContain(
    '인증·등록 창',
  );
  for (const errorCode of ['PLUGIN_NOT_FOUND', 'PLUGIN_LOAD_FAILED']) {
    const notices = pluginNotices(
      { ...emptyMonitorPlugin, state: 'FAILED', errorCode },
      tone,
      0,
    );
    expect(notices[0]).toContain('원음(DI)');
    expect(notices[1]).toContain('지우지 않고 보존');
  }
  const readyNotices = pluginNotices(ready, tone, 0);
  expect(readyNotices).toHaveLength(1);
  expect(readyNotices[0]).toContain('인증 여부는 앱이 알 수 없습니다');
  expect(readyNotices.join(' ')).not.toContain('인증됨');
  expect(pluginNotices({ ...ready, version: '5.11.0' }, tone, 0)[1]).toContain(
    '5.10.4에서 저장',
  );
  expect(pluginOwnershipNotice).toContain('제휴하지 않으며');
});
