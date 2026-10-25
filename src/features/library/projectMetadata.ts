import type { ProjectSummary, JobSnapshot } from './projects';
import { decodeProject, isUuid, runStorageJob } from './projects';
import { isRecord } from '../../shared/validation';

export type ProjectMetadata = Pick<ProjectSummary, 'title' | 'artist'>;
const validText = (text: string) =>
  text.trim().length > 0 && [...text].length <= 200 && !/\p{Cc}/u.test(text);

export function normalizeProjectMetadata(
  title: string,
  artist: string,
): ProjectMetadata {
  if (
    !validText(title) ||
    (artist.trim() && !validText(artist)) ||
    [...artist].length > 200 ||
    /\p{Cc}/u.test(artist)
  )
    throw new Error('PROJECT_METADATA_INVALID');
  return { title: title.trim(), artist: artist.trim() || null };
}
export const projectMetadataApi = {
  async update(
    current: ProjectSummary,
    changes: ProjectMetadata,
    signal: AbortSignal,
    progress: (job: JobSnapshot) => void,
  ): Promise<ProjectSummary> {
    decodeProject(current);
    if (
      !isUuid(current.id) ||
      !validText(current.title) ||
      (current.artist !== null && !validText(current.artist))
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    const normalized = normalizeProjectMetadata(
      changes.title,
      changes.artist ?? '',
    );
    const response = await runStorageJob(
      'update_project_metadata',
      {
        projectId: current.id,
        expected: { title: current.title, artist: current.artist },
        changes: normalized,
      },
      signal,
      progress,
      { waitForCancellation: true },
    );
    if (
      !isRecord(response) ||
      response.schemaVersion !== 1 ||
      Object.keys(response).length !== 2 ||
      !isRecord(response.project) ||
      Object.keys(response.project).length !== 7
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    const updated = decodeProject(response.project);
    if (
      updated.id !== current.id ||
      updated.mode !== current.mode ||
      updated.revision !== current.revision ||
      updated.revisionId !== current.revisionId ||
      updated.title !== normalized.title ||
      updated.artist !== normalized.artist ||
      updated.updatedAtMs < current.updatedAtMs
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    return updated;
  },
};
