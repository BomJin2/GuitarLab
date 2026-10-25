import { useEffect, useRef, useState } from 'react';
import {
  scoreHistoryApi,
  type ScoreRevisionEntry,
  type ScoreRevisionPage,
} from './scoreHistory';
import {
  projectError,
  type JobSnapshot,
  type RevisionDocument,
} from './projects';

export function useScoreHistory(projectId: string) {
  const [page, setPage] = useState<ScoreRevisionPage | null>(null);
  const [preview, setPreview] = useState<RevisionDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const owner = useRef(projectId);
  owner.current = projectId;
  useEffect(() => {
    mounted.current = true;
    setPage(null);
    setPreview(null);
    setError(null);
    setNotice(null);
    setBusy(false);
    setCanceling(false);
    return () => {
      mounted.current = false;
      active.current?.abort();
      active.current = null;
    };
  }, [projectId]);
  async function run<T>(
    work: (
      signal: AbortSignal,
      progress: (job: JobSnapshot) => void,
    ) => Promise<T>,
    apply: (value: T) => void,
  ) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const current = () =>
      mounted.current &&
      owner.current === projectId &&
      active.current === controller;
    setBusy(true);
    setCanceling(false);
    setError(null);
    setNotice(null);
    try {
      const value = await work(controller.signal, (job) => {
        if (current() && job.state === 'CANCELING') setCanceling(true);
      });
      if (current() && !controller.signal.aborted) apply(value);
    } catch (cause) {
      if (current() && !controller.signal.aborted)
        setError(projectError(cause));
    } finally {
      if (current()) {
        if (controller.signal.aborted)
          setNotice('조회가 취소되었습니다. 이전 조회 내용은 유지합니다.');
        setBusy(false);
        setCanceling(false);
        active.current = null;
      }
    }
  }
  return {
    page,
    preview,
    busy,
    canceling,
    error,
    notice,
    load: (beforeRevision: number | null = null) =>
      run(
        (signal, progress) =>
          scoreHistoryApi.list(projectId, beforeRevision, signal, progress),
        (value) => {
          setPage(value);
          setPreview(null);
        },
      ),
    read: (entry: ScoreRevisionEntry) =>
      run(
        (signal, progress) =>
          scoreHistoryApi.read(projectId, entry, signal, progress),
        setPreview,
      ),
    cancel: () => {
      if (!active.current) return;
      setCanceling(true);
      active.current.abort();
    },
  };
}
