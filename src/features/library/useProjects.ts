import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { ScoreSession } from '../score/scoreSession';
import { renderStoredScore } from '../score/normalizedNotation';
import { restoreJudgementSupport } from '../score/alphaTabAdapter';
import { importScoreSession } from '../score/localMediaImport';
import { usePlayer } from '../player/usePlayer';
import { LatestTask } from '../../shared/latestTask';
import { getActiveTrackIndex } from '../score/trackSelection';
import { projectTrashApi, type TrashedProject } from './projectTrash';
import {
  projectApi,
  projectError,
  type AssetInfo,
  type JobSnapshot,
  type ProjectDetails,
  type ProjectMode,
  type ProjectSummary,
  type WorkspaceState,
} from './projects';

export function useProjects(
  session: ScoreSession | null,
  setSession: Dispatch<SetStateAction<ScoreSession | null>>,
  beforeReplace: () => boolean | Promise<boolean>,
) {
  const { engine, state } = usePlayer();
  const native = projectApi.available();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [audioAssetId, setAudioAssetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [trashedProjects, setTrashedProjects] = useState<TrashedProject[]>([]);
  const [trashLoaded, setTrashLoaded] = useState(false);
  const [trashListBusy, setTrashListBusy] = useState(false);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const task = useRef(new LatestTask());
  const operation = useRef(0);
  const mounted = useRef(false);
  const pendingRestore = useRef<WorkspaceState | null>(null);
  const inFlight = useRef(false);
  const confirming = useRef(false);
  const mutation = useRef<{ controller: AbortController | null }>({
    controller: null,
  });
  const trashEpoch = useRef(0);
  const listEpoch = useRef(0);
  const activeSession = useRef(session);
  activeSession.current = session;
  async function refresh() {
    if (!native) return;
    const current = ++listEpoch.current;
    setListBusy(true);
    try {
      const next = await projectApi.list();
      if (mounted.current && current === listEpoch.current) setProjects(next);
    } catch (cause) {
      if (mounted.current && current === listEpoch.current)
        setError(projectError(cause));
    } finally {
      if (mounted.current && current === listEpoch.current) setListBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const epoch = ++listEpoch.current;
    if (native) {
      setListBusy(true);
      void projectApi
        .list()
        .then((next) => {
          if (mounted.current && epoch === listEpoch.current) setProjects(next);
        })
        .catch((cause) => {
          if (mounted.current && epoch === listEpoch.current)
            setError(projectError(cause));
        })
        .finally(() => {
          if (mounted.current && epoch === listEpoch.current)
            setListBusy(false);
        });
    }
    const current = task.current;
    const pendingMutation = mutation.current;
    return () => {
      mounted.current = false;
      current.cancel();
      pendingMutation.controller?.abort();
    };
  }, [native]);
  useEffect(() => {
    const restored = pendingRestore.current;
    if (!restored || state.status === 'loading') return;
    if (state.status === 'error') {
      pendingRestore.current = null;
      return;
    }
    if (state.status !== 'paused' || state.durationMs <= 0) return;
    pendingRestore.current = null;
    try {
      engine.setRate(restored.rate);
      engine.seek(Math.min(restored.positionMs, state.durationMs));
      engine.setLoop(
        restored.playbackLoop.enabled
          ? {
              startMs: restored.playbackLoop.startMs,
              endMs: Math.min(restored.playbackLoop.endMs, state.durationMs),
            }
          : null,
      );
    } catch {
      setError(
        '저장한 재생 구간이 음원 범위를 벗어났습니다. 반복 구간을 다시 지정하세요.',
      );
      engine.setLoop(null);
    }
  }, [engine, state.status, state.durationMs]);
  function cancel() {
    if (mutation.current.controller) {
      mutation.current.controller.abort();
      setNotice(
        '보관·복원 취소를 요청했습니다. 실제 작업이 끝날 때까지 기다립니다. 완료된 작업은 유지됩니다.',
      );
      return;
    }
    operation.current++;
    task.current.cancel();
    inFlight.current = false;
    setBusy(false);
    setJob(null);
    setNotice(
      '취소를 요청했습니다. 이미 완료된 저장은 유지됩니다. 파일 선택 창이 열려 있으면 창에서 취소하세요.',
    );
  }
  async function run<T>(
    work: (
      signal: AbortSignal,
      progress: (job: JobSnapshot) => void,
    ) => Promise<T>,
    apply: (value: T) => void,
  ) {
    if (!native || inFlight.current || confirming.current) return;
    inFlight.current = true;
    const current = ++operation.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    setJob(null);
    const result = await task.current.run((signal) =>
      work(signal, (value) => {
        if (mounted.current && current === operation.current) setJob(value);
      }),
    );
    if (!mounted.current || current !== operation.current) return;
    inFlight.current = false;
    setBusy(false);
    setJob(null);
    if (result.status === 'ready') {
      try {
        apply(result.value);
      } catch (cause) {
        setError(projectError(cause));
      }
    } else if (result.status === 'error') {
      if (
        result.error instanceof DOMException &&
        result.error.name === 'AbortError'
      )
        setNotice('파일 선택 또는 저장 작업을 취소했습니다.');
      else setError(projectError(result.error));
    }
  }
  function clearMedia() {
    pendingRestore.current = null;
    engine.dispose();
    engine.activate();
    setAudioAssetId(null);
  }
  async function open(projectId: string) {
    if (!(await canReplace())) return;
    engine.pause();
    await run(
      async (signal, progress) => {
        const next = await projectApi.open(projectId, signal, progress);
        const revision = next.revision;
        const scoreAsset = next.assets.find(
          (a) => a.id === revision?.scoreAssetId,
        );
        let scoreSession: ScoreSession | null = null;
        let audio: File | null = null;
        if (revision && scoreAsset?.available) {
          const loaded = await projectApi.read(
            projectId,
            scoreAsset.id,
            signal,
            progress,
          );
          const bytes = new Uint8Array(loaded.data);
          signal.throwIfAborted();
          const { score, playbackLookup } = renderStoredScore(
            revision.score,
            bytes,
          );
          scoreSession = {
            score,
            playbackLookup,
            document: restoreJudgementSupport(
              revision.score,
              score,
              playbackLookup,
            ),
            originalBytes: bytes,
            activeTrackIndex: revision.workspace.activeTrackIndex,
            activePerformanceTrackId:
              revision.workspace.activePerformanceTrackId,
            originalAssetId: scoreAsset.id,
            savedRevision: {
              projectId,
              revisionId: revision.revisionId,
              document: revision.score,
            },
          };
        }
        const audioAsset = next.assets.find(
          (a) => a.id === revision?.workspace.audioAssetId,
        );
        if (audioAsset?.available) {
          const loaded = await projectApi.read(
            projectId,
            audioAsset.id,
            signal,
            progress,
          );
          audio = new File([loaded.data], loaded.name);
        }
        return { next, scoreSession, audio };
      },
      ({ next, scoreSession, audio }) => {
        clearMedia();
        setDetails(next);
        setSession(scoreSession);
        setAudioAssetId(next.revision?.workspace.audioAssetId ?? null);
        if (audio && next.revision) {
          pendingRestore.current = next.revision.workspace;
          engine.load(audio);
        }
        if (next.assets.some((a) => !a.available))
          setNotice(
            '프로젝트를 열었습니다. 누락된 원본을 재연결하면 다시 읽을 수 있습니다.',
          );
        else if (
          scoreSession &&
          scoreSession.document !== scoreSession.savedRevision?.document
        )
          setNotice(
            '원본의 미지원 주법을 감점 제외로 복원했습니다. 채점 전 프로젝트를 저장해주세요.',
          );
        else
          setNotice('저장한 프로젝트를 열었습니다. 재생은 직접 시작해주세요.');
        window.location.hash = `#/${next.project.mode}`;
      },
    );
  }
  async function create(title: string, artist: string, mode: ProjectMode) {
    if (!(await canReplace())) return;
    await run(
      async () => projectApi.create(title.trim(), artist.trim() || null, mode),
      (project) => {
        engine.pause();
        clearMedia();
        setSession((previous) =>
          previous
            ? {
                ...previous,
                originalAssetId: undefined,
                savedRevision: undefined,
              }
            : null,
        );
        setDetails({ schemaVersion: 1, project, revision: null, assets: [] });
        listEpoch.current++;
        setListBusy(false);
        setProjects((previous) => [
          project,
          ...previous.filter((p) => p.id !== project.id),
        ]);
        setNotice(
          '프로젝트를 만들었습니다. 기존 악보 표시는 유지되며, 이 프로젝트의 악보·음원을 선택한 뒤 저장하세요.',
        );
        window.location.hash = `#/${mode}`;
      },
    );
  }
  async function importAsset(
    kind: AssetInfo['kind'],
    storage: AssetInfo['storage'],
  ) {
    if (!details) return;
    if (kind === 'SCORE_IMPORT' && !(await canReplace())) return;
    const projectId = details.project.id;
    engine.pause();
    pendingRestore.current = null;
    await run(
      async (signal, progress) => {
        const imported = await projectApi.import(
          projectId,
          kind,
          storage,
          signal,
          progress,
        );
        if (!imported.asset.available) throw new Error('FILE_NOT_FOUND');
        const loaded = await projectApi.read(
          projectId,
          imported.asset.id,
          signal,
          progress,
        );
        if (kind === 'SCORE_IMPORT') {
          signal.throwIfAborted();
          const bytes = new Uint8Array(loaded.data);
          const scoreSession: ScoreSession = {
            ...importScoreSession(bytes, loaded.name),
            originalAssetId: imported.asset.id,
          };
          return { imported, scoreSession, audio: null };
        }
        return {
          imported,
          scoreSession: null,
          audio: new File([loaded.data], loaded.name),
        };
      },
      ({ imported, scoreSession, audio }) => {
        setDetails((previous) =>
          previous
            ? {
                ...previous,
                assets: [
                  ...previous.assets.filter((a) => a.id !== imported.asset.id),
                  imported.asset,
                ],
              }
            : previous,
        );
        if (scoreSession) setSession(scoreSession);
        if (audio) {
          setAudioAssetId(imported.asset.id);
          engine.load(audio);
        }
        setNotice(
          imported.duplicate
            ? '기존에 불러온 동일 파일을 사용합니다. 변경 내용을 저장하세요.'
            : '선택한 파일을 연결했습니다. 변경 내용을 저장하세요.',
        );
      },
    );
  }
  async function relink(assetId: string) {
    if (!details) return;
    const projectId = details.project.id;
    engine.pause();
    await run(
      (signal, progress) =>
        projectApi.relink(projectId, assetId, signal, progress),
      (asset) => {
        setDetails((previous) =>
          previous
            ? {
                ...previous,
                assets: previous.assets.map((a) =>
                  a.id === asset.id ? asset : a,
                ),
              }
            : previous,
        );
        setNotice(
          '동일 원본을 재연결했습니다. 프로젝트 다시 열기를 눌러 악보·음원을 읽으세요.',
        );
      },
    );
  }
  async function createBlankScore() {
    if (!details || !(await canReplace())) return;
    const projectId = details.project.id;
    engine.pause();
    await run(
      async (signal, progress) => {
        const asset = await projectApi.createBlankScore(
          projectId,
          details.project.revision,
          signal,
          progress,
        );
        const loaded = await projectApi.read(
          projectId,
          asset.id,
          signal,
          progress,
        );
        const bytes = new Uint8Array(loaded.data);
        const scoreSession: ScoreSession = {
          ...importScoreSession(bytes, loaded.name),
          originalAssetId: asset.id,
        };
        return { asset, scoreSession };
      },
      ({ asset, scoreSession }) => {
        setDetails((previous) =>
          previous
            ? { ...previous, assets: [...previous.assets, asset] }
            : previous,
        );
        setSession(scoreSession);
        setNotice(
          '빈 1마디를 만들었습니다. 편집 시작 후 음표를 추가하고 프로젝트를 저장하세요. 기존 원본과 저장 버전은 유지됩니다.',
        );
      },
    );
  }
  async function save() {
    if (!details || !session?.originalAssetId) {
      setError('프로젝트의 악보 선택으로 원본을 연결한 뒤 저장하세요.');
      return;
    }
    engine.pause();
    const playback = engine.getSnapshot();
    const currentSession = session;
    const projectId = details.project.id;
    const workspace: WorkspaceState = {
      activeTrackIndex: getActiveTrackIndex(session),
      activePerformanceTrackId:
        session.document.tracks[getActiveTrackIndex(session)]?.id,
      audioAssetId,
      positionMs: playback.audioTimeMs,
      rate: playback.rate,
      playbackLoop: {
        enabled: playback.loop !== null,
        startMs: playback.loop?.startMs ?? 0,
        endMs: playback.loop?.endMs ?? 0,
      },
    };
    if (
      audioAssetId &&
      audioAssetId === details.revision?.workspace.audioAssetId &&
      playback.status === 'empty'
    ) {
      workspace.positionMs = details.revision.workspace.positionMs;
      workspace.rate = details.revision.workspace.rate;
      workspace.playbackLoop = details.revision.workspace.playbackLoop;
    }
    await run(
      (signal, progress) =>
        projectApi.save(
          projectId,
          details.project.revision,
          currentSession.originalAssetId ?? '',
          currentSession.document,
          workspace,
          signal,
          progress,
        ),
      (revision) => {
        setDetails((previous) =>
          previous
            ? {
                ...previous,
                revision,
                project: {
                  ...previous.project,
                  revision: revision.revision,
                  revisionId: revision.revisionId,
                },
              }
            : previous,
        );
        if (activeSession.current?.document === currentSession.document)
          setSession((previous) =>
            previous
              ? {
                  ...previous,
                  savedRevision: {
                    projectId,
                    revisionId: revision.revisionId,
                    document: currentSession.document,
                  },
                }
              : previous,
          );
        setNotice(`버전 ${revision.revision}을 로컬에 저장했습니다.`);
        void refresh();
      },
    );
  }
  async function refreshTrash() {
    if (!native) return;
    const epoch = ++trashEpoch.current;
    setTrashListBusy(true);
    try {
      const entries = await projectTrashApi.list();
      if (mounted.current && epoch === trashEpoch.current) {
        setTrashedProjects(entries);
        setTrashLoaded(true);
      }
    } catch (cause) {
      if (mounted.current && epoch === trashEpoch.current)
        setError(projectError(cause));
    } finally {
      if (mounted.current && epoch === trashEpoch.current)
        setTrashListBusy(false);
    }
  }
  async function mutateTrash(
    work: (
      signal: AbortSignal,
      progress: (job: JobSnapshot) => void,
    ) => Promise<void>,
  ) {
    if (!native || inFlight.current || confirming.current) return;
    inFlight.current = true;
    const current = ++operation.current;
    const controller = new AbortController();
    mutation.current.controller = controller;
    setBusy(true);
    setError(null);
    setNotice(null);
    setJob(null);
    try {
      await work(controller.signal, (value) => {
        if (mounted.current && current === operation.current) setJob(value);
      });
    } catch (cause) {
      if (mounted.current && current === operation.current) {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          setNotice('보관·복원 작업을 취소했습니다. 이전 상태를 유지합니다.');
        else setError(projectError(cause));
      }
    } finally {
      if (mutation.current.controller === controller)
        mutation.current.controller = null;
      if (mounted.current && current === operation.current) {
        inFlight.current = false;
        setBusy(false);
        setJob(null);
        void refresh();
        void refreshTrash();
      }
    }
  }
  async function trashProject(item: ProjectSummary) {
    const current = details?.project.id === item.id;
    if (current && !(await canReplace())) return;
    await mutateTrash(async (signal, progress) => {
      const entry = await projectTrashApi.trash(item, signal, progress);
      if (!mounted.current) return;
      if (current) {
        clearMedia();
        setSession(null);
        setDetails(null);
      }
      setProjects((previous) =>
        previous.filter((p) => p.id !== entry.project.id),
      );
      setNotice(
        '프로젝트를 휴지통에 보관했습니다. 원본·녹음 파일은 유지되며 복원할 수 있습니다.',
      );
    });
  }
  async function restoreProject(entry: TrashedProject) {
    await mutateTrash(async (signal, progress) => {
      const restored = await projectTrashApi.restore(entry, signal, progress);
      if (!mounted.current) return;
      setTrashedProjects((previous) =>
        previous.filter((p) => p.trashId !== entry.trashId),
      );
      setNotice(`‘${restored.title}’을 복원했습니다. 목록에서 열 수 있습니다.`);
    });
  }
  const scoreSaved = Boolean(
    session?.savedRevision &&
      session.document === session.savedRevision.document &&
      session.savedRevision.projectId === details?.project.id,
  );
  async function canReplace() {
    if (!native || !mounted.current || inFlight.current || confirming.current)
      return false;
    const source = activeSession.current;
    const epoch = operation.current;
    confirming.current = true;
    setBusy(true);
    try {
      const accepted = await beforeReplace();
      if (
        !mounted.current ||
        epoch !== operation.current ||
        activeSession.current !== source
      )
        return false;
      if (accepted === true) return true;
      setNotice(
        '기존 악보 편집을 유지했습니다. 프로젝트에 저장한 뒤 다시 시도할 수 있습니다.',
      );
    } catch {
      if (mounted.current)
        setError(
          '악보 교체 확인을 열지 못했습니다. 기존 편집을 유지합니다. 프로젝트를 저장한 뒤 다시 시도하세요.',
        );
    } finally {
      confirming.current = false;
      if (mounted.current) setBusy(false);
    }
    return false;
  }
  return {
    native,
    projects,
    details,
    busy,
    listBusy,
    trashedProjects,
    trashLoaded,
    trashListBusy,
    job,
    error,
    notice,
    audioAssetId,
    scoreSaved,
    refresh,
    open,
    create,
    importAsset,
    createBlankScore,
    relink,
    save,
    cancel,
    refreshTrash,
    trashProject,
    restoreProject,
  };
}
export type ProjectController = ReturnType<typeof useProjects>;
