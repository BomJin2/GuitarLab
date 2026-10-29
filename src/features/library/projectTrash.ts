import { invoke } from '@tauri-apps/api/core';
import { isRecord, isSafeUnsigned } from '../../shared/validation';
import {
  decodeProject,
  isUuid,
  runStorageJob,
  type JobSnapshot,
  type ProjectSummary,
} from './projects';

export type TrashedProject = {
  project: ProjectSummary;
  trashId: string;
  trashedAtMs: number;
  purgeStarted?: true;
};
export type TrashUsage = {
  projectId: string;
  trashId: string;
  files: number;
  logicalBytes: number;
  externalReferences: number;
};
export function decodeTrashUsage(value: unknown): TrashUsage {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 5 ||
    !isUuid(value.projectId) ||
    !isUuid(value.trashId) ||
    !isSafeUnsigned(value.files, 10000) ||
    !isSafeUnsigned(value.logicalBytes) ||
    !isSafeUnsigned(value.externalReferences, 100000) ||
    (value.files === 0 && value.logicalBytes !== 0)
  )
    return invalid();
  return {
    projectId: value.projectId,
    trashId: value.trashId,
    files: value.files,
    logicalBytes: value.logicalBytes,
    externalReferences: value.externalReferences,
  };
}
function invalid(): never {
  throw new Error('PROJECT_CONTRACT_INVALID');
}
function summary(value: unknown): ProjectSummary {
  if (!isRecord(value) || Object.keys(value).length !== 7) return invalid();
  return decodeProject(value);
}
export function decodeTrashedProject(value: unknown): TrashedProject {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== (value.purgeStarted === true ? 4 : 3) ||
    ('purgeStarted' in value && value.purgeStarted !== true) ||
    !isUuid(value.trashId) ||
    !isSafeUnsigned(value.trashedAtMs)
  )
    return invalid();
  return {
    project: summary(value.project),
    trashId: value.trashId,
    trashedAtMs: value.trashedAtMs,
    ...(value.purgeStarted === true
      ? { purgeStarted: value.purgeStarted }
      : {}),
  };
}
export function decodeTrashList(value: unknown): TrashedProject[] {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.projects) ||
    value.projects.length > 1000
  )
    return invalid();
  const entries = value.projects.map(decodeTrashedProject);
  if (
    new Set(entries.map((e) => e.project.id)).size !== entries.length ||
    new Set(entries.map((e) => e.trashId)).size !== entries.length
  )
    return invalid();
  for (let i = 1; i < entries.length; i++) {
    const previous = entries[i - 1];
    const current = entries[i];
    if (
      !previous ||
      !current ||
      previous.trashedAtMs < current.trashedAtMs ||
      (previous.trashedAtMs === current.trashedAtMs &&
        previous.project.id >= current.project.id)
    )
      return invalid();
  }
  return entries;
}
function envelope(value: unknown, state: string): Record<string, unknown> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    value.schemaVersion !== 1 ||
    value.state !== state
  )
    return invalid();
  return value;
}
export const projectTrashApi = {
  async usage(
    entry: TrashedProject,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ): Promise<TrashUsage> {
    if (!isUuid(entry.project.id) || !isUuid(entry.trashId)) return invalid();
    const value = envelope(
      await runStorageJob(
        'inspect_trashed_project_usage',
        { projectId: entry.project.id, trashId: entry.trashId },
        signal,
        progress,
        { waitForCancellation: true },
      ),
      'PROJECT_TRASH_USAGE',
    );
    const usage = decodeTrashUsage(value.usage);
    if (usage.projectId !== entry.project.id || usage.trashId !== entry.trashId)
      return invalid();
    return usage;
  },
  async list() {
    return decodeTrashList(
      await invoke<unknown>('list_trashed_projects', {
        request: { schemaVersion: 1 },
      }),
    );
  },
  async trash(
    project: ProjectSummary,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ): Promise<TrashedProject> {
    if (!isUuid(project.id) || !isSafeUnsigned(project.revision, 4294967295))
      return invalid();
    const value = envelope(
      await runStorageJob(
        'trash_project',
        { projectId: project.id, expectedRevision: project.revision },
        signal,
        progress,
        { waitForCancellation: true },
      ),
      'PROJECT_TRASHED',
    );
    const entry = decodeTrashedProject(value.entry);
    if (
      entry.project.id !== project.id ||
      entry.project.revision !== project.revision ||
      entry.project.revisionId !== project.revisionId
    )
      return invalid();
    return entry;
  },
  async restore(
    entry: TrashedProject,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ): Promise<ProjectSummary> {
    if (!isUuid(entry.project.id) || !isUuid(entry.trashId)) return invalid();
    const value = envelope(
      await runStorageJob(
        'restore_trashed_project',
        { projectId: entry.project.id, trashId: entry.trashId },
        signal,
        progress,
        { waitForCancellation: true },
      ),
      'PROJECT_RESTORED',
    );
    const restored = summary(value.project);
    if (
      restored.id !== entry.project.id ||
      restored.revision !== entry.project.revision ||
      restored.revisionId !== entry.project.revisionId
    )
      return invalid();
    return restored;
  },
};
