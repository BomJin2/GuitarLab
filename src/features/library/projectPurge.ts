import { isRecord, isSafeUnsigned } from '../../shared/validation';
import { runStorageJob, type JobSnapshot } from './projects';
import {
  decodeTrashedProject,
  decodeTrashUsage,
  type TrashedProject,
  type TrashUsage,
} from './projectTrash';

export type PurgePlan = TrashUsage & {
  revision: number;
  title: string;
  fingerprint: string;
  purgeStarted: boolean;
};
function invalid(): never {
  throw new Error('PROJECT_CONTRACT_INVALID');
}
export function decodePurgePlan(value: unknown): PurgePlan {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 9 ||
    !isSafeUnsigned(value.revision, 4294967295) ||
    typeof value.title !== 'string' ||
    value.title.length === 0 ||
    [...value.title].length > 200 ||
    /\p{Cc}/u.test(value.title) ||
    typeof value.fingerprint !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.fingerprint) ||
    typeof value.purgeStarted !== 'boolean'
  )
    return invalid();
  const usage = decodeTrashUsage({
    projectId: value.projectId,
    trashId: value.trashId,
    files: value.files,
    logicalBytes: value.logicalBytes,
    externalReferences: value.externalReferences,
  });
  return {
    ...usage,
    revision: value.revision,
    title: value.title,
    fingerprint: value.fingerprint,
    purgeStarted: value.purgeStarted,
  };
}
export const projectPurgeApi = {
  async prepare(
    entry: TrashedProject,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ): Promise<PurgePlan> {
    decodeTrashedProject(entry);
    const value = await runStorageJob(
      'prepare_trashed_project_purge',
      { projectId: entry.project.id, trashId: entry.trashId },
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 3 ||
      value.schemaVersion !== 1 ||
      value.state !== 'PROJECT_PURGE_PREPARED'
    )
      return invalid();
    const plan = decodePurgePlan(value.plan);
    if (
      plan.projectId !== entry.project.id ||
      plan.trashId !== entry.trashId ||
      plan.revision !== entry.project.revision ||
      plan.title !== entry.project.title ||
      plan.purgeStarted !== (entry.purgeStarted === true)
    )
      return invalid();
    return plan;
  },
  async purge(
    plan: PurgePlan,
    confirmedTitle: string,
    consent: boolean,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ): Promise<TrashUsage> {
    decodePurgePlan(plan);
    if (!consent || confirmedTitle !== plan.title)
      throw new Error('PROJECT_PURGE_CONFIRMATION_REQUIRED');
    const value = await runStorageJob(
      'purge_trashed_project',
      {
        projectId: plan.projectId,
        trashId: plan.trashId,
        fingerprint: plan.fingerprint,
        confirmedTitle,
        confirmPermanentDelete: true,
      },
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 7 ||
      value.schemaVersion !== 1 ||
      value.state !== 'PROJECT_PURGED'
    )
      return invalid();
    const usage = decodeTrashUsage({
      projectId: value.projectId,
      trashId: value.trashId,
      files: value.files,
      logicalBytes: value.logicalBytes,
      externalReferences: value.externalReferences,
    });
    if (
      usage.projectId !== plan.projectId ||
      usage.trashId !== plan.trashId ||
      usage.files !== plan.files ||
      usage.logicalBytes !== plan.logicalBytes ||
      usage.externalReferences !== plan.externalReferences
    )
      return invalid();
    return usage;
  },
};
