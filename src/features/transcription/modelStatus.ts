import { invoke, isTauri } from '@tauri-apps/api/core';
import { isRecord } from '../../shared/validation';

// docs/12 "AI 모델 설치 상태 조회 v1"
export type ModelStatusId = 'basic-pitch' | 'htdemucs_6s';
export type ModelState = 'INSTALLED' | 'MISSING' | 'DAMAGED';
const ids: ModelStatusId[] = ['basic-pitch', 'htdemucs_6s'];
const states: ModelState[] = ['INSTALLED', 'MISSING', 'DAMAGED'];

export function decodeModelStatus(
  value: unknown,
): Record<ModelStatusId, ModelState> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.models) ||
    value.models.length !== ids.length
  )
    throw new Error('AI_PROTOCOL_INVALID');
  const models: unknown[] = value.models;
  const result = {} as Record<ModelStatusId, ModelState>;
  ids.forEach((id, index) => {
    const m = models[index];
    if (
      !isRecord(m) ||
      Object.keys(m).length !== 2 ||
      m.id !== id ||
      !states.includes(m.state as ModelState)
    )
      throw new Error('AI_PROTOCOL_INVALID');
    result[id] = m.state as ModelState;
  });
  return result;
}

export const modelStatusApi = {
  available: isTauri,
  async get() {
    return decodeModelStatus(
      await invoke<unknown>('get_ai_model_status', {
        request: { schemaVersion: 1 },
      }),
    );
  },
};
