import { parseUniqueJson } from '../../shared/json';
import { isRecord } from '../../shared/validation';
import { isUuid } from './projects';

const key = 'guitarlab.score-autosave.v1';

function read(): string[] {
  const raw = window.localStorage.getItem(key);
  if (raw === null) return [];
  if (raw.length > 8192) throw new Error('AUTOSAVE_PREFERENCE_INVALID');
  const value = parseUniqueJson(raw);
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.projectIds) ||
    value.projectIds.length > 128 ||
    !value.projectIds.every(isUuid) ||
    new Set(value.projectIds).size !== value.projectIds.length
  )
    throw new Error('AUTOSAVE_PREFERENCE_INVALID');
  return value.projectIds;
}

export function readScoreAutosavePreference(projectId: string): boolean {
  if (!isUuid(projectId)) throw new Error('AUTOSAVE_PROJECT_INVALID');
  return read().includes(projectId);
}

export function writeScoreAutosavePreference(
  projectId: string,
  enabled: boolean,
) {
  if (!isUuid(projectId)) throw new Error('AUTOSAVE_PROJECT_INVALID');
  const ids = read().filter((id) => id !== projectId);
  if (enabled) ids.push(projectId);
  if (ids.length > 128) throw new Error('AUTOSAVE_PREFERENCE_LIMIT');
  if (ids.length === 0) window.localStorage.removeItem(key);
  else
    window.localStorage.setItem(
      key,
      JSON.stringify({ schemaVersion: 1, projectIds: ids }),
    );
}
