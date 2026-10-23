import { useEffect, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import { localDiagnosticsApi, type LocalDiagnostics } from './localDiagnostics';

type State =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; value: LocalDiagnostics };
export function useLocalDiagnostics() {
  const [state, setState] = useState<State>({ status: 'idle' });
  const task = useRef(new LatestTask());
  const native = localDiagnosticsApi.available();
  useEffect(() => {
    const current = task.current;
    return () => current.cancel();
  }, []);
  async function read() {
    if (!native) return;
    setState({ status: 'loading' });
    const outcome = await task.current.run(() => localDiagnosticsApi.read());
    if (outcome.status === 'ready')
      setState({ status: 'ready', value: outcome.value });
    if (outcome.status === 'error') setState({ status: 'error' });
  }
  return { native, state, read };
}
