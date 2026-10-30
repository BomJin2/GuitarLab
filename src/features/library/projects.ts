import { invoke, isTauri } from '@tauri-apps/api/core';
import { scoreArchiveErrorMessage } from '../score/scoreArchive';
import type { ScoreDocument } from '../../entities/score';
import { decodeScoreDocument } from '../../entities/scoreValidation';
import {
  isRecord,
  isSafeUnsigned,
  isNumberWithin,
} from '../../shared/validation';
import { logDiagnostic } from '../../shared/logger';
import { scoreUploadBody } from './scoreUpload';
import { sendAudioChunks } from './audioUpload';
import { validateLocalMediaFile } from '../score/localMediaImport';
export type ProjectMode = 'copy' | 'practice' | 'performance';
export type ProjectSummary = {
  id: string;
  title: string;
  artist: string | null;
  mode: ProjectMode;
  revision: number;
  revisionId: string | null;
  updatedAtMs: number;
};
export type AssetInfo = {
  id: string;
  projectId: string;
  kind: 'SCORE_IMPORT' | 'ORIGINAL';
  storage: 'MANAGED' | 'REFERENCE';
  name: string;
  sha256: string;
  bytes: number;
  available: boolean;
};
export type WorkspaceState = {
  activeTrackIndex: number;
  activePerformanceTrackId?: string;
  audioAssetId: string | null;
  positionMs: number;
  rate: number;
  playbackLoop: { enabled: boolean; startMs: number; endMs: number };
};
export type RevisionDocument = {
  schemaVersion: 1;
  projectId: string;
  revisionId: string;
  revision: number;
  scoreAssetId: string;
  score: ScoreDocument;
  workspace: WorkspaceState;
};
export type ProjectDetails = {
  schemaVersion: 1;
  project: ProjectSummary;
  revision: RevisionDocument | null;
  assets: AssetInfo[];
};
export type JobSnapshot = {
  schemaVersion: 1;
  jobId: string;
  state:
    | 'PICKING'
    | 'RUNNING'
    | 'CANCELING'
    | 'COMPLETED'
    | 'CANCELED'
    | 'ERROR';
  completedBytes: number;
  totalBytes: number;
  result: unknown;
  errorCode: string | null;
};
export const localBackupByteLimit = 2 * 1024 * 1024 * 1024;
export function isUuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(v)
  );
}
function text(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && [...v].length <= max;
}
function project(v: unknown): v is ProjectSummary {
  return (
    isRecord(v) &&
    isUuid(v.id) &&
    text(v.title, 200) &&
    (v.artist === null || text(v.artist, 200)) &&
    (v.mode === 'copy' || v.mode === 'practice' || v.mode === 'performance') &&
    isSafeUnsigned(v.revision, 4294967295) &&
    (v.revision === 0 ? v.revisionId === null : isUuid(v.revisionId)) &&
    isSafeUnsigned(v.updatedAtMs)
  );
}
function asset(v: unknown): v is AssetInfo {
  return (
    isRecord(v) &&
    isUuid(v.id) &&
    isUuid(v.projectId) &&
    (v.kind === 'SCORE_IMPORT' || v.kind === 'ORIGINAL') &&
    (v.storage === 'MANAGED' || v.storage === 'REFERENCE') &&
    text(v.name, 512) &&
    typeof v.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(v.sha256) &&
    isSafeUnsigned(
      v.bytes,
      v.kind === 'SCORE_IMPORT' ? 8 * 1024 * 1024 : 256 * 1024 * 1024,
    ) &&
    v.bytes > 0 &&
    typeof v.available === 'boolean'
  );
}
export function decodeProject(value: unknown): ProjectSummary {
  if (!project(value)) throw new Error('PROJECT_CONTRACT_INVALID');
  return value;
}
export function decodeAssets(value: unknown): AssetInfo[] {
  if (
    !Array.isArray(value) ||
    !value.every(asset) ||
    new Set(value.map((a) => a.id)).size !== value.length
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  return value;
}
export function decodeRevision(v: unknown): RevisionDocument {
  if (
    !isRecord(v) ||
    v.schemaVersion !== 1 ||
    !isUuid(v.projectId) ||
    !isUuid(v.revisionId) ||
    !isSafeUnsigned(v.revision, 4294967295) ||
    v.revision === 0 ||
    !isUuid(v.scoreAssetId) ||
    !isRecord(v.workspace)
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  const score = decodeScoreDocument(v.score);
  const w = v.workspace;
  const loop = w.playbackLoop;
  if (
    !isSafeUnsigned(w.activeTrackIndex, score.tracks.length - 1) ||
    (w.activePerformanceTrackId !== undefined &&
      w.activePerformanceTrackId !== score.tracks[w.activeTrackIndex]?.id) ||
    (w.audioAssetId !== null && !isUuid(w.audioAssetId)) ||
    !isNumberWithin(w.positionMs, 0, 86400000) ||
    !isNumberWithin(w.rate, 0.5, 1.5) ||
    !isRecord(loop) ||
    typeof loop.enabled !== 'boolean' ||
    !isNumberWithin(loop.startMs, 0, 86400000) ||
    !isNumberWithin(loop.endMs, loop.startMs, 86400000) ||
    (loop.enabled && loop.endMs - loop.startMs < 250)
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    projectId: v.projectId,
    revisionId: v.revisionId,
    revision: v.revision,
    scoreAssetId: v.scoreAssetId,
    score,
    workspace: {
      activeTrackIndex: w.activeTrackIndex,
      activePerformanceTrackId: score.tracks[w.activeTrackIndex]?.id,
      audioAssetId: w.audioAssetId,
      positionMs: w.positionMs,
      rate: w.rate,
      playbackLoop: {
        enabled: loop.enabled,
        startMs: loop.startMs,
        endMs: loop.endMs,
      },
    },
  };
}
export function decodeDetails(v: unknown): ProjectDetails {
  if (!isRecord(v) || v.schemaVersion !== 1)
    throw new Error('PROJECT_CONTRACT_INVALID');
  const project = decodeProject(v.project);
  const assets = decodeAssets(v.assets);
  const revision = v.revision === null ? null : decodeRevision(v.revision);
  if (
    assets.some((a) => a.projectId !== project.id) ||
    (revision
      ? revision.projectId !== project.id ||
        revision.revision !== project.revision ||
        revision.revisionId !== project.revisionId ||
        !assets.some(
          (a) => a.id === revision.scoreAssetId && a.kind === 'SCORE_IMPORT',
        ) ||
        (revision.workspace.audioAssetId !== null &&
          !assets.some(
            (a) =>
              a.id === revision.workspace.audioAssetId && a.kind === 'ORIGINAL',
          ))
      : project.revision !== 0)
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  return { schemaVersion: 1, project, revision, assets };
}
export function decodeJob(v: unknown, command = ''): JobSnapshot {
  const byteLimit = [
    'prepare_trashed_project_purge',
    'purge_trashed_project',
  ].includes(command)
    ? Number.MAX_SAFE_INTEGER
    : [
          'backup_local_data',
          'verify_local_backup',
          'preview_local_backup',
          'restore_local_backup',
        ].includes(command)
      ? localBackupByteLimit
      : 256 * 1024 * 1024;
  if (
    !isRecord(v) ||
    v.schemaVersion !== 1 ||
    !isUuid(v.jobId) ||
    !isSafeUnsigned(v.totalBytes, byteLimit) ||
    !isSafeUnsigned(v.completedBytes, v.totalBytes) ||
    (v.errorCode !== null && typeof v.errorCode !== 'string')
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  const state = v.state;
  if (
    state !== 'PICKING' &&
    state !== 'RUNNING' &&
    state !== 'CANCELING' &&
    state !== 'COMPLETED' &&
    state !== 'CANCELED' &&
    state !== 'ERROR'
  )
    throw new Error('PROJECT_CONTRACT_INVALID');
  return {
    schemaVersion: 1,
    jobId: v.jobId,
    state,
    completedBytes: v.completedBytes,
    totalBytes: v.totalBytes,
    result: v.result,
    errorCode: v.errorCode,
  };
}
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('작업 취소', 'AbortError'));
      return;
    }
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, 150);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('작업 취소', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function runStorageJob(
  command: string,
  request: Record<string, unknown>,
  signal: AbortSignal,
  progress: (value: JobSnapshot) => void,
  options: {
    waitForCancellation?: boolean;
    body?: Uint8Array;
    prepare?: (job: JobSnapshot) => Promise<void>;
  } = {},
): Promise<unknown> {
  if (signal.aborted) throw new DOMException('작업 취소', 'AbortError');
  let snapshot = decodeJob(
    await invoke<unknown>(
      command,
      options.body ?? {
        request: { schemaVersion: 1, ...request },
      },
    ),
    command,
  );
  const id = snapshot.jobId;
  let cancelRequested = false;
  const cancel = () => {
    if (cancelRequested) return;
    cancelRequested = true;
    void invoke('cancel_storage_job', {
      request: { schemaVersion: 1, jobId: id },
    }).catch(() => logDiagnostic('warn', 'STORAGE_CANCEL_FAILED'));
  };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const pollSignal = options.waitForCancellation
    ? new AbortController().signal
    : signal;
  try {
    let preparationFailure: { cause: unknown } | null = null;
    if (options.prepare) {
      progress(snapshot);
      try {
        await options.prepare(snapshot);
      } catch (cause) {
        preparationFailure = { cause };
        cancel();
      }
      const next = decodeJob(
        await invoke<unknown>('get_storage_job', {
          request: { schemaVersion: 1, jobId: id },
        }),
        command,
      );
      if (next.jobId !== id) throw new Error('PROJECT_CONTRACT_INVALID');
      snapshot = next;
    }
    while (true) {
      progress(snapshot);
      if (snapshot.state === 'COMPLETED') {
        if (preparationFailure) throw preparationFailure.cause;
        return snapshot.result;
      }
      if (snapshot.state === 'CANCELED') {
        if (preparationFailure) throw preparationFailure.cause;
        throw new DOMException('작업 취소', 'AbortError');
      }
      if (snapshot.state === 'ERROR')
        throw new Error(snapshot.errorCode ?? 'STORAGE_ERROR');
      await delay(pollSignal);
      const next = decodeJob(
        await invoke<unknown>('get_storage_job', {
          request: { schemaVersion: 1, jobId: id },
        }),
        command,
      );
      if (next.jobId !== id) throw new Error('PROJECT_CONTRACT_INVALID');
      snapshot = next;
    }
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
function envelope(v: unknown): Record<string, unknown> {
  if (!isRecord(v) || v.schemaVersion !== 1)
    throw new Error('PROJECT_CONTRACT_INVALID');
  return v;
}
export const projectApi = {
  available: isTauri,
  async list() {
    const v = envelope(
      await invoke<unknown>('list_projects', { request: { schemaVersion: 1 } }),
    );
    if (!Array.isArray(v.projects) || !v.projects.every(project))
      throw new Error('PROJECT_CONTRACT_INVALID');
    return v.projects;
  },
  async create(title: string, artist: string | null, mode: ProjectMode) {
    const v = envelope(
      await invoke<unknown>('create_project', {
        request: { schemaVersion: 1, title, artist, mode },
      }),
    );
    return decodeProject(v.project);
  },
  async open(
    projectId: string,
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
  ) {
    const value = decodeDetails(
      await runStorageJob('open_project', { projectId }, signal, progress),
    );
    if (value.project.id !== projectId)
      throw new Error('PROJECT_CONTRACT_INVALID');
    return value;
  },
  async import(
    projectId: string,
    kind: AssetInfo['kind'],
    storage: AssetInfo['storage'],
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
  ) {
    const v = envelope(
      await runStorageJob(
        'pick_project_asset',
        { projectId, kind, storage },
        signal,
        progress,
      ),
    );
    if (
      !asset(v.asset) ||
      typeof v.duplicate !== 'boolean' ||
      v.asset.projectId !== projectId
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    return { asset: v.asset, duplicate: v.duplicate };
  },
  async importDroppedScore(
    projectId: string,
    file: File,
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
  ) {
    if (!isUuid(projectId)) throw new Error('PROJECT_CONTRACT_INVALID');
    const body = await scoreUploadBody(projectId, file, signal);
    const v = envelope(
      await runStorageJob('import_project_score_bytes', {}, signal, progress, {
        body,
        waitForCancellation: true,
      }),
    );
    if (
      !asset(v.asset) ||
      typeof v.duplicate !== 'boolean' ||
      v.asset.projectId !== projectId ||
      v.asset.kind !== 'SCORE_IMPORT' ||
      v.asset.storage !== 'MANAGED' ||
      !v.asset.available
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    return { asset: v.asset, duplicate: v.duplicate };
  },
  async importDroppedAudio(
    projectId: string,
    file: File,
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
  ) {
    if (!isUuid(projectId)) throw new Error('PROJECT_CONTRACT_INVALID');
    validateLocalMediaFile('audio', file);
    const v = envelope(
      await runStorageJob(
        'begin_project_audio_upload',
        { projectId, name: file.name, bytes: file.size },
        signal,
        progress,
        {
          waitForCancellation: true,
          prepare: (job) => sendAudioChunks(job, file, signal, progress),
        },
      ),
    );
    if (
      !asset(v.asset) ||
      typeof v.duplicate !== 'boolean' ||
      v.asset.projectId !== projectId ||
      v.asset.kind !== 'ORIGINAL' ||
      v.asset.storage !== 'MANAGED' ||
      !v.asset.available ||
      v.asset.bytes !== file.size
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    return { asset: v.asset, duplicate: v.duplicate };
  },
  async relink(
    projectId: string,
    assetId: string,
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
  ) {
    const v = envelope(
      await runStorageJob(
        'relink_project_asset',
        { projectId, assetId },
        signal,
        progress,
      ),
    );
    if (
      !asset(v.asset) ||
      v.asset.projectId !== projectId ||
      v.asset.id !== assetId
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    return v.asset;
  },
  async createBlankScore(
    projectId: string,
    expectedRevision: number,
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
  ) {
    if (!isUuid(projectId) || !isSafeUnsigned(expectedRevision, 4294967295))
      throw new Error('PROJECT_CONTRACT_INVALID');
    const v = envelope(
      await runStorageJob(
        'create_blank_project_score',
        { projectId, expectedRevision },
        signal,
        progress,
        { waitForCancellation: true },
      ),
    );
    if (
      !asset(v.asset) ||
      v.asset.projectId !== projectId ||
      v.asset.kind !== 'SCORE_IMPORT' ||
      v.asset.storage !== 'MANAGED' ||
      !v.asset.available
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    return v.asset;
  },
  async save(
    projectId: string,
    expectedRevision: number,
    scoreAssetId: string,
    score: ScoreDocument,
    workspace: WorkspaceState,
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
  ) {
    const v = envelope(
      await runStorageJob(
        'save_project_revision',
        { projectId, expectedRevision, scoreAssetId, score, workspace },
        signal,
        progress,
      ),
    );
    const revision = decodeRevision(v.revision);
    if (
      revision.projectId !== projectId ||
      revision.revision !== expectedRevision + 1 ||
      revision.scoreAssetId !== scoreAssetId
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    return revision;
  },
  async read(
    projectId: string,
    assetId: string,
    signal: AbortSignal,
    progress: (v: JobSnapshot) => void,
    options: { waitForCancellation?: boolean } = {},
  ) {
    let jobId = '';
    const v = envelope(
      await runStorageJob(
        'read_project_asset',
        { projectId, assetId },
        signal,
        (snapshot) => {
          jobId = snapshot.jobId;
          progress(snapshot);
        },
        options,
      ),
    );
    if (
      !text(v.name, 512) ||
      !isSafeUnsigned(v.bytes, 256 * 1024 * 1024) ||
      v.bytes === 0
    )
      throw new Error('PROJECT_CONTRACT_INVALID');
    const data = await invoke<unknown>('take_storage_bytes', {
      request: { schemaVersion: 1, jobId },
    });
    if (!(data instanceof ArrayBuffer) || data.byteLength !== v.bytes)
      throw new Error('PROJECT_CONTRACT_INVALID');
    return { name: v.name, data };
  },
};
export function projectError(error: unknown) {
  const archiveError = scoreArchiveErrorMessage(error);
  if (archiveError) return archiveError;
  const code =
    isRecord(error) && typeof error.code === 'string'
      ? error.code
      : error instanceof Error
        ? error.message
        : '';
  switch (code) {
    case 'PROJECT_METADATA_INVALID':
      return '제목과 아티스트는 제어문자 없는 200자 이하로 입력하세요. 아티스트는 비워둘 수 있습니다.';
    case 'PROJECT_METADATA_CONFLICT':
      return '프로젝트 정보가 바뀌었습니다. 목록을 새로고침하고 프로젝트를 다시 연 뒤 수정하세요. 기존 편집은 유지합니다.';
    case 'RECORDING_BUSY':
      return '녹음을 저장한 뒤 프로젝트 작업을 진행하세요.';
    case 'PROJECT_IN_TRASH':
      return '휴지통에 보관된 프로젝트입니다. 라이브러리에서 복원한 뒤 여세요.';
    case 'PROJECT_TRASH_CHANGED':
      return '휴지통 상태가 바뀌었습니다. 휴지통 목록을 다시 읽어주세요.';
    case 'PROJECT_USAGE_UNAVAILABLE':
      return '용량을 안전하게 확인하지 못했습니다. 링크·파일 수·폴더 깊이와 접근 권한을 확인하세요. 원본은 변경하지 않았습니다.';
    case 'PROJECT_PURGE_CONFIRMATION_REQUIRED':
      return '삭제할 프로젝트 제목을 정확히 입력하고 영구 삭제에 동의해주세요.';
    case 'PROJECT_PURGE_CHANGED':
      return '삭제 대상이 바뀌었습니다. 남은 대상을 다시 확인하고 새로 동의해주세요.';
    case 'PROJECT_PURGE_REFERENCED':
      return '삭제할 관리 폴더의 파일을 원본이나 다른 프로젝트가 참조하고 있어 삭제하지 않습니다. 먼저 연결을 확인하세요.';
    case 'PROJECT_PURGE_UNAVAILABLE':
      return '삭제 대상을 안전하게 읽거나 지우지 못했습니다. 링크·접근 권한·사용 중인 파일을 확인하고 남은 대상을 다시 읽어주세요. 이미 삭제한 파일은 복구되지 않습니다.';
    case 'PROJECT_PURGE_IN_PROGRESS':
      return '영구 삭제를 시작한 프로젝트입니다. 일반 복원 대신 휴지통에서 남은 대상을 다시 확인하고 삭제를 재개하세요.';
    case 'PROJECT_IN_USE':
      return '프로젝트의 연습·녹음을 마친 뒤 다시 시도하세요.';
    case 'PROJECT_TRASH_LIMIT':
      return '휴지통 보관 한도 1000개에 도달했습니다. 기존 항목을 복원하거나 삭제 대상을 확인해주세요.';
    case 'REVISION_CONFLICT':
      return '저장 버전이 바뀌었거나 악보가 저장 내용과 다릅니다. 프로젝트를 다시 열거나 변경 내용을 저장하세요.';
    case 'ASSET_MISMATCH':
      return '선택한 파일이 이전 원본과 다릅니다. 기존 연결은 유지됩니다.';
    case 'FILE_NOT_FOUND':
      return '원본 파일이 없습니다. 같은 파일을 재연결하세요.';
    case 'FILE_INVALID':
      return '파일 형식·크기를 확인하세요. 악보8MiB, 음원256MiB까지 지원합니다.';
    case 'UPLOAD_TIMEOUT':
      return '파일 전송이 중단되어 임시 파일을 정리했습니다. 파일을 다시 놓아주세요.';
    case 'DISK_SPACE_LOW':
      return '임시 보관과 관리용 복사를 위한 디스크 여유 공간을 확보해주세요.';
    case 'STORAGE_BUSY':
      return '진행 중인 파일 작업을 마치거나 파일 선택 창을 취소하세요.';
    case 'PROJECT_CONTRACT_INVALID':
      return '저장 응답 형식이 맞지 않습니다. 목록과 현재 상태·앱 버전을 확인하세요.';
    case 'ARCHIVE_EVENT_GAP':
      return '연습 이벤트 기록에 누락이 있어 저장을 중단했습니다. 기존 기록은 보존됩니다.';
    default:
      return '프로젝트 작업을 완료하지 못했습니다. 목록과 현재 상태를 다시 확인하세요.';
  }
}
