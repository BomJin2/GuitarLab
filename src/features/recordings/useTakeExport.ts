import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import type { JobSnapshot } from '../library/projects';
import type { RecordedTake } from './recordings';
import { takeExportApi, takeExportError } from './takeExport';

export function useTakeExport(take: RecordedTake) {
  const { projectId, id, sha256, frames, sampleRate, state } = take;
  const context = useMemo(
    () => ({ projectId, id, sha256, frames, sampleRate, state }),
    [projectId, id, sha256, frames, sampleRate, state],
  );
  const task = useRef(new LatestTask());
  const active = useRef<typeof context | null>(null);
  const owner = useRef<typeof context | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{
    context: typeof context;
    canceling: boolean;
    job: JobSnapshot | null;
    message: string | null;
    error: string | null;
  } | null>(null);
  useLayoutEffect(() => {
    owner.current = context;
    const current = task.current;
    return () => {
      owner.current = null;
      current.cancel();
    };
  }, [context]);
  const currentView = view?.context === context ? view : null;
  const ownsContext = () => owner.current === context;
  async function exportTake() {
    if (
      !ownsContext() ||
      active.current ||
      !takeExportApi.available() ||
      state !== 'READY'
    )
      return;
    active.current = context;
    setBusy(true);
    setView({
      context,
      canceling: false,
      job: null,
      error: null,
      message: null,
    });
    const result = await task.current.run((signal) =>
      takeExportApi.export(take, signal, (value) => {
        if (ownsContext() && !signal.aborted)
          setView((current) =>
            current?.context === context ? { ...current, job: value } : current,
          );
      }),
    );
    active.current = null;
    if (owner.current) setBusy(false);
    if (!ownsContext()) return;
    setView((current) =>
      current?.context === context
        ? {
            ...current,
            canceling: false,
            message:
              result.status === 'ready'
                ? `원본과 동일한 새 WAV로 ${result.value.bytes.toLocaleString('ko-KR')}바이트를 저장했습니다.`
                : result.status === 'canceled'
                  ? '내보내기를 취소했습니다. 이미 저장을 마친 파일은 유지됩니다.'
                  : null,
            error:
              result.status === 'error' ? takeExportError(result.error) : null,
          }
        : current,
    );
  }
  return {
    busy,
    canceling: busy && (!currentView || currentView.canceling),
    job: currentView?.job ?? null,
    message: currentView?.message ?? null,
    error: currentView?.error ?? null,
    available: takeExportApi.available(),
    exportTake,
    cancel() {
      if (ownsContext() && active.current === context) {
        setView((current) =>
          current?.context === context
            ? { ...current, canceling: true }
            : current,
        );
        task.current.cancel();
      }
    },
  };
}
