import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ScoreDocument } from '../../entities/score';
import type { JobSnapshot } from '../library/projects';
import { isRecord } from '../../shared/validation';
import {
  scoreExportApi,
  scoreExportError,
  type ScoreExportFormat,
} from './scoreExport';

// source는 파일 읽기가 아닌 작업 취소·상태 초기화의 문맥 식별자입니다.
export function useScoreExport(source: object, enabled = true) {
  const native = scoreExportApi.available();
  const context = useMemo(() => ({ source }), [source]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{
    context: typeof context;
    error: string | null;
    notice: string | null;
    job: JobSnapshot | null;
    canceling: boolean;
  } | null>(null);
  const task = useRef<AbortController | null>(null);
  const operation = useRef<typeof context | null>(null);
  const owner = useRef<typeof context | null>(null);
  const allowed = useRef(enabled);
  useLayoutEffect(() => {
    allowed.current = enabled;
  }, [enabled]);
  useLayoutEffect(() => {
    const current = task;
    owner.current = context;
    return () => {
      owner.current = null;
      current.current?.abort();
    };
  }, [context]);
  const currentView = view?.context === context ? view : null;
  const ownsContext = () => owner.current === context;
  return {
    native,
    busy,
    error: currentView?.error ?? null,
    notice: currentView?.notice ?? null,
    job: currentView?.job ?? null,
    canceling: busy && (!currentView || currentView.canceling),
    export: async (document: ScoreDocument, format: ScoreExportFormat) => {
      if (
        !ownsContext() ||
        !allowed.current ||
        !scoreExportApi.available() ||
        operation.current
      )
        return;
      operation.current = context;
      const controller = new AbortController();
      task.current = controller;
      setBusy(true);
      setView({
        context,
        error: null,
        notice: null,
        job: null,
        canceling: false,
      });
      try {
        const result = await scoreExportApi.export(
          document,
          format,
          controller.signal,
          (next) => {
            if (ownsContext() && !controller.signal.aborted)
              setView((current) =>
                current?.context === context
                  ? {
                      ...current,
                      job: next,
                      canceling:
                        current.canceling || next.state === 'CANCELING',
                    }
                  : current,
              );
          },
        );
        if (!ownsContext()) return;
        setView((current) =>
          current?.context === context
            ? {
                ...current,
                canceling: false,
                error: null,
                notice: controller.signal.aborted
                  ? '출력 취소를 요청했습니다. 이미 저장된 파일은 유지될 수 있습니다.'
                  : `새 ${format} 파일로 저장했습니다 · ${result.bytes.toLocaleString()}바이트`,
              }
            : current,
        );
      } catch (cause) {
        if (!ownsContext()) return;
        const canceled = isRecord(cause) && cause.name === 'AbortError';
        setView((current) =>
          current?.context === context
            ? {
                ...current,
                canceling: false,
                error: canceled ? null : scoreExportError(cause),
                notice: canceled
                  ? '출력 취소를 요청했습니다. 이미 저장된 파일은 유지될 수 있습니다.'
                  : null,
              }
            : current,
        );
      } finally {
        task.current = null;
        operation.current = null;
        if (owner.current) setBusy(false);
      }
    },
    cancel: () => {
      if (!ownsContext() || operation.current !== context) return;
      setView((current) =>
        current?.context === context
          ? { ...current, canceling: true }
          : current,
      );
      task.current?.abort();
    },
  };
}
