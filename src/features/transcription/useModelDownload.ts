import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import { aiRuntimeError } from './runtime';
import type { AiModelId } from './modelInstallation';
import { modelCacheApi, type ModelCacheInfo } from './modelCache';

export function useModelDownload() {
  const [modelId, setModelId] = useState<AiModelId>('basic-pitch');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [result, setResult] = useState<ModelCacheInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const operation = useRef(false);
  const approval = useRef(false);
  const task = useRef(new LatestTask());
  const mounted = useRef(false);
  const context = useMemo(() => ({ modelId }), [modelId]);
  const owner = useRef<typeof context | null>(context);
  const ownsContext = () => mounted.current && owner.current === context;
  useLayoutEffect(() => {
    const current = task.current;
    owner.current = context;
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.cancel();
    };
  }, [context]);
  return {
    modelId,
    selectModel: (id: AiModelId) => {
      if (!ownsContext() || operation.current) return;
      if (id !== modelId) owner.current = null;
      setModelId(id);
      approval.current = false;
      setConsent(false);
      setResult(null);
      setError(null);
      setNotice(null);
      setPercent(0);
    },
    consent,
    setConsent: (value: boolean) => {
      if (!ownsContext() || operation.current) return;
      approval.current = value;
      setConsent(value);
    },
    busy,
    percent,
    result,
    error,
    notice,
    native: modelCacheApi.available(),
    cancel: () => {
      if (ownsContext()) task.current.cancel();
    },
    download: async () => {
      if (
        !ownsContext() ||
        !approval.current ||
        operation.current ||
        !modelCacheApi.available()
      )
        return;
      operation.current = true;
      approval.current = false;
      setBusy(true);
      setConsent(false);
      setPercent(0);
      setResult(null);
      setError(null);
      setNotice(null);
      const outcome = await task.current.run((signal) =>
        modelCacheApi.download(
          true,
          signal,
          (value) => {
            if (mounted.current && !signal.aborted) setPercent(value);
          },
          modelId,
        ),
      );
      operation.current = false;
      if (!ownsContext()) return;
      setBusy(false);
      if (outcome.status === 'ready') setResult(outcome.value);
      else if (outcome.status === 'error')
        setError(aiRuntimeError(outcome.error));
      else
        setNotice(
          '다운로드를 취소했습니다. 검증된 캐시는 다음 시도에 재사용합니다.',
        );
    },
  };
}
