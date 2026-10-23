import { invoke, isTauri } from '@tauri-apps/api/core';
import { isRecord, isSafeUnsigned } from '../../shared/validation';

const codes = [
  'APP_STARTED',
  'APP_EXITED',
  'NATIVE_PANIC',
  'STORAGE_INIT_FAILED',
  'RECORDING_RECOVERY_INIT_FAILED',
  'APP_START_FAILED',
] as const;
type DiagnosticCode = (typeof codes)[number];
type DiagnosticEvent = { unixMs: number; code: DiagnosticCode };
export type LocalDiagnostics = {
  schemaVersion: 1;
  persistenceAvailable: boolean;
  droppedEvents: number;
  events: DiagnosticEvent[];
};
export const diagnosticLabels: Record<DiagnosticCode, string> = {
  APP_STARTED: '앱 초기화 시작',
  APP_EXITED: '앱 정상 종료',
  NATIVE_PANIC: '네이티브 panic 감지',
  STORAGE_INIT_FAILED: '프로젝트 저장 초기화 실패',
  RECORDING_RECOVERY_INIT_FAILED: '미완료 녹음 확인 실패',
  APP_START_FAILED: '앱 실행 실패',
};
export function decodeLocalDiagnostics(value: unknown): LocalDiagnostics {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    value.schemaVersion !== 1 ||
    typeof value.persistenceAvailable !== 'boolean' ||
    !isSafeUnsigned(value.droppedEvents) ||
    !Array.isArray(value.events) ||
    value.events.length > 64
  )
    throw new Error('DIAGNOSTICS_INVALID');
  const events = value.events.map((event: unknown): DiagnosticEvent => {
    if (
      !isRecord(event) ||
      Object.keys(event).length !== 2 ||
      !isSafeUnsigned(event.unixMs)
    )
      throw new Error('DIAGNOSTICS_INVALID');
    const code = codes.find((code) => code === event.code);
    if (!code) throw new Error('DIAGNOSTICS_INVALID');
    return { unixMs: event.unixMs, code };
  });
  return {
    schemaVersion: 1,
    persistenceAvailable: value.persistenceAvailable,
    droppedEvents: value.droppedEvents,
    events,
  };
}
export const localDiagnosticsApi = {
  available: isTauri,
  async read() {
    return decodeLocalDiagnostics(
      await invoke<unknown>('get_local_diagnostics', {
        request: { schemaVersion: 1 },
      }),
    );
  },
};
