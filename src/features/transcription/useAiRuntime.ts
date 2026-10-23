import { useEffect, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import { aiRuntimeApi, aiRuntimeError, type AiRuntime } from './runtime';

export function useAiRuntime() {
  const native = aiRuntimeApi.available();
  const task = useRef(new LatestTask());
  const mounted = useRef(false);
  const operation = useRef(false);
  const [busy, setBusy] = useState(false);
  const [runtime, setRuntime] = useState<AiRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const current = task.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.cancel();
    };
  }, []);
  return {
    native,
    busy,
    runtime,
    error,
    notice,
    inspect: async () => {
      if (!native || operation.current) return;
      operation.current = true;
      setBusy(true);
      setError(null);
      setNotice(null);
      setRuntime(null);
      const result = await task.current.run((signal) =>
        aiRuntimeApi.inspect(signal),
      );
      if (!mounted.current) return;
      operation.current = false;
      setBusy(false);
      if (result.status === 'ready') setRuntime(result.value);
      else if (result.status === 'error')
        setError(aiRuntimeError(result.error));
      else setNotice('AI 환경 확인을 취소했습니다.');
    },
    cancel: () => task.current.cancel(),
  };
}
