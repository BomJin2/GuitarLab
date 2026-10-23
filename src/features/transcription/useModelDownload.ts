import { useEffect, useRef, useState } from 'react';
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
  const task = useRef(new LatestTask());
  const mounted = useRef(false);
  useEffect(() => {
    const current = task.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.cancel();
    };
  }, []);
  return {
    modelId,
    selectModel: (id: AiModelId) => {
      if (operation.current) return;
      setModelId(id);
      setConsent(false);
      setResult(null);
      setError(null);
      setNotice(null);
      setPercent(0);
    },
    consent,
    setConsent,
    busy,
    percent,
    result,
    error,
    notice,
    native: modelCacheApi.available(),
    cancel: () => task.current.cancel(),
    download: async () => {
      if (!consent || operation.current || !modelCacheApi.available()) return;
      operation.current = true;
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
      if (!mounted.current) return;
      operation.current = false;
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
