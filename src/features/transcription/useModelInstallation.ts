import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  const context = useMemo(() => ({ model }), [model]);
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
    model,
    result,
    message,
    error,
    busy,
    native: modelInstallationApi.available(),
    select: (value: AiModelId) => {
      if (!ownsContext() || operation.current) return;
      if (value !== model) owner.current = null;
      setModel(value);
      setResult(null);
      setError(null);
      setMessage(null);
    },
    cancel: () => {
      if (ownsContext()) task.current.cancel();
    },
    verify: async () => {
      if (
        !ownsContext() ||
        !modelInstallationApi.available() ||
        operation.current
      )
        return;
      operation.current = true;
      setBusy(true);
      setResult(null);
      setError(null);
      setMessage(null);
      const outcome = await task.current.run((signal) =>
        modelInstallationApi.verify(model, signal),
      );
      operation.current = false;
      if (!ownsContext()) return;
      setBusy(false);
      if (outcome.status === 'ready') setResult(outcome.value);
      else if (outcome.status === 'error')
        setError(aiRuntimeError(outcome.error));
      else setMessage('모델 설치 확인을 취소했습니다.');
    },
  };
}
