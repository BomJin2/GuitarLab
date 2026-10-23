import { useEffect, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import { aiRuntimeError } from './runtime';
import {
  modelInstallationApi,
  type AiModelId,
  type ModelInstallation,
} from './modelInstallation';

export function useModelInstallation() {
  const [model, setModel] = useState<AiModelId>('basic-pitch');
  const [result, setResult] = useState<ModelInstallation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const mounted = useRef(false);
  const task = useRef(new LatestTask());
  useEffect(() => {
    const current = task.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.cancel();
    };
  }, []);
  return {
    model,
    result,
    message,
    error,
    busy,
    native: modelInstallationApi.available(),
    select: (value: AiModelId) => {
      if (operation.current) return;
      setModel(value);
      setResult(null);
      setError(null);
      setMessage(null);
    },
    cancel: () => task.current.cancel(),
    verify: async () => {
      if (!modelInstallationApi.available() || operation.current) return;
      operation.current = true;
      setBusy(true);
      setResult(null);
      setError(null);
      setMessage(null);
      const outcome = await task.current.run((signal) =>
        modelInstallationApi.verify(model, signal),
      );
      if (!mounted.current) return;
      operation.current = false;
      setBusy(false);
      if (outcome.status === 'ready') setResult(outcome.value);
      else if (outcome.status === 'error')
        setError(aiRuntimeError(outcome.error));
      else setMessage('모델 설치 확인을 취소했습니다.');
    },
  };
}
