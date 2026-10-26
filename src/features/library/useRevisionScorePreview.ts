import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  projectApi,
  projectError,
  type JobSnapshot,
  type RevisionDocument,
} from './projects';
import {
  renderNormalized,
  renderStoredScore,
  scoreXmlLimitMessage,
} from '../score/normalizedNotation';

export function useRevisionScorePreview(revision: RevisionDocument | null) {
  const [requested, setRequested] = useState<RevisionDocument | null>(null);
  const [original, setOriginal] = useState<ReturnType<
    typeof renderStoredScore
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const owner = useRef(revision);
  owner.current = revision;
  useLayoutEffect(() => {
    mounted.current = true;
    setRequested(null);
    setOriginal(null);
    setError(null);
    setJob(null);
    setBusy(active.current !== null);
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, [revision]);
  const normalized = revision?.score.renderSource === 'NORMALIZED';
  const eligible = revision !== null && (normalized || projectApi.available());
  const open = eligible && revision !== null && requested === revision;
  const result = useMemo(() => {
    if (!open || !normalized || !revision) return { value: null, error: null };
    try {
      return { value: renderNormalized(revision.score), error: null };
    } catch (cause) {
      return {
        value: null,
        error:
          cause instanceof Error && cause.message === 'SCORE_XML_LIMIT'
            ? scoreXmlLimitMessage
            : '저장 편집본의 TAB를 만들지 못했습니다. 기본 단성 6줄 편집 범위와 음표 정보를 확인하세요. 아래 표와 원본은 유지했습니다.',
      };
    }
  }, [open, normalized, revision]);
  async function readOriginal(revision: RevisionDocument) {
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    setJob(null);
    const current = () =>
      mounted.current &&
      owner.current === revision &&
      active.current === controller;
    try {
      const loaded = await projectApi.read(
        revision.projectId,
        revision.scoreAssetId,
        controller.signal,
        (snapshot) => {
          if (current() && !controller.signal.aborted) setJob(snapshot);
        },
        { waitForCancellation: true },
      );
      controller.signal.throwIfAborted();
      const value = renderStoredScore(
        revision.score,
        new Uint8Array(loaded.data),
      );
      if (current()) setOriginal(value);
    } catch (cause) {
      if (current() && !controller.signal.aborted)
        setError(projectError(cause));
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (mounted.current) {
          setBusy(false);
          setJob(null);
        }
      }
    }
  }
  return {
    value: open ? (normalized ? result.value : original) : null,
    error: open ? (normalized ? result.error : error) : null,
    busy,
    job,
    eligible,
    open,
    show: () => {
      if (!eligible || !revision || active.current) return;
      setRequested(revision);
      if (!normalized) void readOriginal(revision);
    },
    hide: () => {
      active.current?.abort();
      setRequested(null);
      setOriginal(null);
      setError(null);
    },
  };
}
