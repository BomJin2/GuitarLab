import { invoke } from '@tauri-apps/api/core';
import { isRecord, isSafeUnsigned } from '../../shared/validation';

/** docs/12 "모니터 AmpliTube 삽입 v1" */
export type MonitorPluginSnapshot = {
  schemaVersion: 1;
  state: 'NONE' | 'LOADING' | 'READY' | 'FAILED';
  name: string | null;
  vendor: string | null;
  version: string | null;
  classId: string | null;
  sampleRate: number | null;
  latencyFrames: number | null;
  inUse: boolean;
  /** docs/12 "AmpliTube 에디터 창 v1" */
  editorOpen: boolean;
  errorCode: string | null;
};
export const emptyMonitorPlugin: MonitorPluginSnapshot = {
  schemaVersion: 1,
  state: 'NONE',
  name: null,
  vendor: null,
  version: null,
  classId: null,
  sampleRate: null,
  latencyFrames: null,
  inUse: false,
  editorOpen: false,
  errorCode: null,
};
const text = (value: unknown) =>
  value === null || (typeof value === 'string' && value.length <= 256);
export function decodeMonitorPlugin(value: unknown): MonitorPluginSnapshot {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !['NONE', 'LOADING', 'READY', 'FAILED'].includes(value.state as string) ||
    !text(value.name) ||
    !text(value.vendor) ||
    !text(value.version) ||
    !text(value.classId) ||
    !(value.sampleRate === null || isSafeUnsigned(value.sampleRate, 192000)) ||
    !(value.latencyFrames === null || isSafeUnsigned(value.latencyFrames)) ||
    typeof value.inUse !== 'boolean' ||
    typeof value.editorOpen !== 'boolean' ||
    !(value.errorCode === null || typeof value.errorCode === 'string') ||
    (value.state === 'READY' &&
      (value.name === null || value.sampleRate === null))
  )
    throw new Error('PLUGIN_CONTRACT_INVALID');
  return value as MonitorPluginSnapshot;
}
/** docs/12 "프로젝트 AmpliTube 톤 v1"(blob은 받지 않음) */
export type ProjectPluginState = {
  schemaVersion: 1;
  projectId: string;
  saved: boolean;
  classId: string | null;
  pluginVersion: string | null;
  bytes: number | null;
};
export function decodeProjectPluginState(
  value: unknown,
  projectId: string,
): ProjectPluginState {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.projectId !== projectId ||
    typeof value.saved !== 'boolean' ||
    !text(value.classId) ||
    !text(value.pluginVersion) ||
    !(value.bytes === null || isSafeUnsigned(value.bytes, 8 * 1024 * 1024)) ||
    value.saved !== (value.bytes !== null)
  )
    throw new Error('PLUGIN_CONTRACT_INVALID');
  return value as ProjectPluginState;
}
export const monitorPluginApi = {
  async status() {
    return decodeMonitorPlugin(await invoke<unknown>('get_monitor_plugin'));
  },
  async load(sampleRate: number) {
    return decodeMonitorPlugin(
      await invoke<unknown>('load_monitor_plugin', {
        request: { schemaVersion: 1, sampleRate },
      }),
    );
  },
  async unload() {
    return decodeMonitorPlugin(
      await invoke<unknown>('unload_monitor_plugin', {
        request: { schemaVersion: 1 },
      }),
    );
  },
  async openEditor() {
    return decodeMonitorPlugin(
      await invoke<unknown>('open_monitor_plugin_editor', {
        request: { schemaVersion: 1 },
      }),
    );
  },
  async closeEditor() {
    return decodeMonitorPlugin(
      await invoke<unknown>('close_monitor_plugin_editor', {
        request: { schemaVersion: 1 },
      }),
    );
  },
  async projectTone(projectId: string) {
    return decodeProjectPluginState(
      await invoke<unknown>('get_project_plugin_state', {
        request: { schemaVersion: 1, projectId },
      }),
      projectId,
    );
  },
  async saveProjectTone(projectId: string) {
    return decodeProjectPluginState(
      await invoke<unknown>('save_project_plugin_state', {
        request: { schemaVersion: 1, projectId },
      }),
      projectId,
    );
  },
  async restoreProjectTone(projectId: string) {
    return decodeMonitorPlugin(
      await invoke<unknown>('restore_project_plugin_state', {
        request: { schemaVersion: 1, projectId },
      }),
    );
  },
};
const messages: Record<string, string> = {
  PLUGIN_NOT_FOUND:
    'AmpliTube 5 VST3를 찾지 못했습니다. IK Product Manager로 설치·인증한 뒤 다시 시도하세요.',
  PLUGIN_LOAD_FAILED: 'AmpliTube 5를 열지 못했습니다.',
  PLUGIN_BUS_UNSUPPORTED:
    'AmpliTube 5가 mono 입력·stereo 출력을 받지 않았습니다.',
  PLUGIN_IN_USE: '모니터를 끈 뒤 AmpliTube를 해제하세요.',
  PLUGIN_BUSY: 'AmpliTube를 불러오는 중입니다.',
  PLUGIN_NOT_READY: 'AmpliTube를 먼저 불러오세요.',
  PLUGIN_RATE_MISMATCH:
    '입력 샘플레이트가 바뀌었습니다. AmpliTube를 해제하고 다시 불러오세요.',
  PLUGIN_EDITOR_UNSUPPORTED:
    '이 플러그인은 자체 편집 화면을 제공하지 않습니다.',
  PLUGIN_EDITOR_FAILED: 'AmpliTube 편집 창을 열지 못했습니다.',
  PLUGIN_STATE_NOT_FOUND: '이 프로젝트에 저장한 AmpliTube 톤이 없습니다.',
  PLUGIN_STATE_MISMATCH: '다른 플러그인에서 저장한 톤이라 불러오지 않았습니다.',
  PLUGIN_STATE_FAILED:
    'AmpliTube 톤을 저장하거나 불러오지 못했습니다. 저장해 둔 톤은 그대로 보존합니다.',
  PLUGIN_STATE_TOO_LARGE: 'AmpliTube 상태가 8MB보다 커서 저장하지 않았습니다.',
  PROJECT_IN_TRASH: '휴지통에 보관된 프로젝트입니다. 먼저 복원하세요.',
};
const missingCodes = [
  'PLUGIN_NOT_FOUND',
  'PLUGIN_LOAD_FAILED',
  'PLUGIN_BUS_UNSUPPORTED',
];
/** 불러오기가 이보다 오래 걸리면 인증·등록 창을 의심합니다. */
export const SLOW_LOAD_SECONDS = 45;
export const pluginOwnershipNotice =
  'AmpliTube와 IK Multimedia는 각 소유자의 상표입니다. GuitarLab은 IK Multimedia와 제휴하지 않으며, 사용자가 설치·인증한 제품을 불러올 뿐 배포하지 않습니다.';
/** docs/12 "AmpliTube 누락·인증 안내 v1": 상태별 안내(상표 고지는 화면에 항상 따로 표시). */
export function pluginNotices(
  state: MonitorPluginSnapshot,
  tone: ProjectPluginState | null,
  loadingSeconds: number,
): string[] {
  const notices: string[] = [];
  if (state.state === 'LOADING' && loadingSeconds >= SLOW_LOAD_SECONDS)
    notices.push(
      `불러오기가 ${loadingSeconds}초째입니다. AmpliTube 인증·등록 창이나 IK 안내 창이 다른 창 뒤나 작업 표시줄에 떠 있을 수 있습니다. 그 창을 끝내야 불러오기가 끝나며 앱에서는 취소할 수 없습니다.`,
    );
  if (state.errorCode && missingCodes.includes(state.errorCode))
    notices.push(
      'AmpliTube 없이도 모니터·녹음·재생은 원음(DI)으로 그대로 됩니다.',
    );
  if (state.state === 'READY') {
    notices.push(
      '"준비됨"은 플러그인을 불러왔다는 뜻이며 인증 여부는 앱이 알 수 없습니다. 소리가 나지 않거나 주기적으로 끊기거나 편집 창에 인증 안내가 보이면 IK Product Manager에서 인증 상태를 확인하세요.',
    );
    if (tone?.saved && tone.pluginVersion !== state.version)
      notices.push(
        `이 프로젝트의 톤은 AmpliTube ${tone.pluginVersion}에서 저장했습니다(지금 ${state.version ?? '알 수 없음'}). 불러오면 AmpliTube가 변환하거나 거부할 수 있습니다.`,
      );
  } else if (tone?.saved)
    notices.push(
      `이 프로젝트에 저장한 AmpliTube 톤(${tone.pluginVersion})은 지우지 않고 보존합니다. AmpliTube를 불러온 뒤 "저장한 톤 불러오기"로 적용하세요.`,
    );
  return notices;
}
export function monitorPluginMessage(code: string | null): string | null {
  if (!code) return null;
  return messages[code] ?? 'AmpliTube 작업에 실패했습니다.';
}
