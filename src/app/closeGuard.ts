import { invoke, isTauri } from '@tauri-apps/api/core';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function closeIntent(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value).length !== 2 ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('requestId' in value) ||
    typeof value.requestId !== 'string' ||
    !uuid.test(value.requestId)
  )
    throw new Error('CLOSE_CONTRACT_INVALID');
  return value.requestId;
}
async function request(
  command: string,
  payload: object,
  allowed: string[],
): Promise<void> {
  const value: unknown = await invoke(command, {
    request: { schemaVersion: 1, ...payload },
  });
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value).length !== 2 ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('state' in value) ||
    typeof value.state !== 'string' ||
    !allowed.includes(value.state)
  )
    throw new Error('CLOSE_CONTRACT_INVALID');
}
export const closeGuardApi = {
  available: isTauri,
  enable: () => request('enable_close_guard', {}, ['ENABLED']),
  resolve: (requestId: string, hasUnsavedScore: boolean) => {
    closeIntent({ schemaVersion: 1, requestId });
    return request('resolve_close_request', { requestId, hasUnsavedScore }, [
      'CONFIRMING',
      'CLOSE_REQUESTED',
    ]);
  },
};
