import { isRecord, isSafeUnsigned } from '../../shared/validation';
import {
  decodeRevision,
  isUuid,
  runStorageJob,
  type JobSnapshot,
  type RevisionDocument,
} from './projects';

export type ScoreRevisionEntry = {
  revisionId: string;
  revision: number;
  createdAtMs: number;
};
export type ScoreRevisionPage = {
  projectId: string;
  headRevision: number;
  entries: ScoreRevisionEntry[];
  nextBeforeRevision: number | null;
};
function invalid(): never {
  throw new Error('PROJECT_CONTRACT_INVALID');
}
function envelope(value: unknown, key: string) {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    Object.keys(value).length !== 2 ||
    !isRecord(value[key])
  )
    return invalid();
  return value[key];
}
const positiveRevision = (value: unknown): value is number =>
  isSafeUnsigned(value, 4294967295) && value > 0;

export function decodeRevisionPage(
  value: unknown,
  projectId: string,
  beforeRevision: number | null,
): ScoreRevisionPage {
  const page = envelope(value, 'page');
  if (
    Object.keys(page).length !== 4 ||
    page.projectId !== projectId ||
    !isSafeUnsigned(page.headRevision, 4294967295) ||
    !Array.isArray(page.entries) ||
    page.entries.length > 100
  )
    return invalid();
  let upper = beforeRevision;
  const headRevision = page.headRevision;
  const ids = new Set<string>();
  const entries: ScoreRevisionEntry[] = page.entries.map((entry: unknown) => {
    if (
      !isRecord(entry) ||
      Object.keys(entry).length !== 3 ||
      !isUuid(entry.revisionId) ||
      ids.has(entry.revisionId) ||
      !positiveRevision(entry.revision) ||
      entry.revision > headRevision ||
      (upper !== null && entry.revision >= upper) ||
      !isSafeUnsigned(entry.createdAtMs)
    )
      return invalid();
    ids.add(entry.revisionId);
    upper = entry.revision;
    return {
      revisionId: entry.revisionId,
      revision: entry.revision,
      createdAtMs: entry.createdAtMs,
    };
  });
  if (
    (beforeRevision === null &&
      (entries[0]?.revision ?? 0) !== page.headRevision) ||
    (page.nextBeforeRevision !== null &&
      (!positiveRevision(page.nextBeforeRevision) ||
        entries.length !== 100 ||
        page.nextBeforeRevision !== entries.at(-1)?.revision))
  )
    return invalid();
  return {
    projectId,
    headRevision: page.headRevision,
    entries,
    nextBeforeRevision: page.nextBeforeRevision,
  };
}
export const scoreHistoryApi = {
  async list(
    projectId: string,
    beforeRevision: number | null,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ): Promise<ScoreRevisionPage> {
    if (
      !isUuid(projectId) ||
      (beforeRevision !== null && !positiveRevision(beforeRevision))
    )
      return invalid();
    return decodeRevisionPage(
      await runStorageJob(
        'list_score_revisions',
        { projectId, beforeRevision },
        signal,
        progress,
        { waitForCancellation: true },
      ),
      projectId,
      beforeRevision,
    );
  },
  async read(
    projectId: string,
    entry: ScoreRevisionEntry,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ): Promise<RevisionDocument> {
    if (
      !isUuid(projectId) ||
      !isUuid(entry.revisionId) ||
      !positiveRevision(entry.revision)
    )
      return invalid();
    const revision = decodeRevision(
      envelope(
        await runStorageJob(
          'read_score_revision',
          { projectId, revisionId: entry.revisionId },
          signal,
          progress,
          { waitForCancellation: true },
        ),
        'revision',
      ),
    );
    if (
      revision.projectId !== projectId ||
      revision.revisionId !== entry.revisionId ||
      revision.revision !== entry.revision
    )
      return invalid();
    return revision;
  },
};
