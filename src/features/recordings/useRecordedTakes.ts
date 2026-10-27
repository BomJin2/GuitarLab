import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { JobSnapshot } from '../library/projects';
import { recordingApi, recordingError, type RecordedTake } from './recordings';

export function useRecordedTakes(
  projectId: string | undefined,
  locked = false,
) {
  const [takes, setTakes] = useState<RecordedTake[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [writing, setWriting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const context = useMemo(() => ({ projectId }), [projectId]);
  const owner = useRef(context),
    mounted = useRef(false),
    currentLocked = useRef(locked);
  const generation = useRef(0);
  const listing = useRef<typeof context | null>(null);
  const latestTakes = useRef<RecordedTake[]>([]);
  const operation = useRef<{
    context: typeof context;
    kind: 'recover' | 'update';
    controller: AbortController;
  } | null>(null);
  const ownsContext = () => mounted.current && owner.current === context;
  const visible = owner.current === context;
  useLayoutEffect(() => {
    currentLocked.current = locked;
  }, [locked]);
  const load = useCallback(async () => {
    if (
      !mounted.current ||
      owner.current !== context ||
      !projectId ||
      listing.current === context
    )
      return;
    const current = ++generation.current;
    listing.current = context;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await recordingApi.list(projectId);
      if (
        !mounted.current ||
        owner.current !== context ||
        generation.current !== current
      )
        return;
      if (
        result.some((take) => take.projectId !== projectId) ||
        new Set(result.map((take) => take.id)).size !== result.length
      )
        throw new Error('RECORDING_CONTRACT_INVALID');
      latestTakes.current = result;
      setTakes(result);
      setLoaded(true);
    } catch (cause) {
      if (
        mounted.current &&
        owner.current === context &&
        generation.current === current
      )
        setError(recordingError(cause));
    } finally {
      if (owner.current === context && generation.current === current) {
        listing.current = null;
        if (mounted.current) setLoading(false);
      }
    }
  }, [projectId, context]);
  useLayoutEffect(() => {
    owner.current = context;
    mounted.current = true;
    latestTakes.current = [];
    setTakes([]);
    setLoaded(false);
    setError(null);
    setNotice(null);
    setJob(null);
    setLoading(false);
    setCanceling(false);
    void load();
    const listGeneration = generation;
    return () => {
      mounted.current = false;
      listGeneration.current++;
      listing.current = null;
      operation.current?.controller.abort();
    };
  }, [context, load]);
  async function run(
    take: RecordedTake,
    kind: 'recover' | 'update',
    work: (
      current: RecordedTake,
      signal: AbortSignal,
      progress: (value: JobSnapshot) => void,
    ) => Promise<RecordedTake>,
  ) {
    if (
      !ownsContext() ||
      currentLocked.current ||
      operation.current ||
      listing.current === context
    )
      return;
    const current = latestTakes.current.find(
      (item) => item.id === take.id && item.projectId === take.projectId,
    );
    if (
      !current ||
      current.projectId !== projectId ||
      (kind === 'recover' && current.state !== 'RECOVERABLE_ERROR')
    ) {
      setError(recordingError(new Error('TAKE_CHANGED')));
      return;
    }
    const pending = { context, kind, controller: new AbortController() };
    operation.current = pending;
    setWriting(true);
    setCanceling(false);
    setError(null);
    setNotice(null);
    setJob(null);
    try {
      await work(current, pending.controller.signal, (value) => {
        if (ownsContext() && !pending.controller.signal.aborted) setJob(value);
      });
      if (!ownsContext()) return;
      await load();
      if (ownsContext())
        setNotice(
          kind === 'update'
            ? '테이크 정보를 저장했습니다.'
            : pending.controller.signal.aborted
              ? '취소를 요청했지만 완료된 복구본을 보존했습니다.'
              : '원본을 보존한 새 복구 테이크를 만들었습니다.',
        );
    } catch (cause) {
      if (ownsContext()) {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          setNotice(
            '복구 취소 처리를 마쳤습니다. 원본과 이미 완성된 복구본은 유지합니다.',
          );
        else setError(recordingError(cause));
      }
    } finally {
      if (operation.current === pending) {
        operation.current = null;
        if (mounted.current) setWriting(false);
      }
      if (ownsContext()) setCanceling(false);
    }
  }
  const ownOperation =
    operation.current?.context === context ? operation.current : null;
  return {
    takes: visible ? takes : [],
    loaded: visible && loaded,
    busy: (visible && loading) || writing || locked,
    error: visible ? error : null,
    notice: visible ? notice : null,
    job: visible ? job : null,
    canceling: visible && canceling,
    recovering: ownOperation?.kind === 'recover',
    canCancel:
      visible &&
      !canceling &&
      (ownOperation?.kind === 'recover' ||
        (!operation.current && listing.current === context)),
    refresh: async () => {
      if (!currentLocked.current && !operation.current) await load();
    },
    recover: (take: RecordedTake) =>
      run(take, 'recover', (current, signal, progress) =>
        recordingApi.recover(current.projectId, current.id, signal, progress),
      ),
    update: (take: RecordedTake, name: string, memo: string, offset: number) =>
      run(take, 'update', (current) =>
        recordingApi.update(current, name, memo, offset),
      ),
    cancel() {
      if (!ownsContext()) return;
      const pending = operation.current;
      if (pending?.context === context && pending.kind === 'recover') {
        setCanceling(true);
        pending.controller.abort();
      } else if (!operation.current && listing.current === context) {
        generation.current++;
        listing.current = null;
        setLoading(false);
        setNotice(
          '테이크 목록 조회를 취소했습니다. 늦게 온 결과는 표시하지 않습니다.',
        );
      }
    },
  };
}
