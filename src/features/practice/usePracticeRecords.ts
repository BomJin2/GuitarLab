import { useEffect, useMemo, useState } from 'react';
import { projectError } from '../library/projects';
import { recordApi, type StoredAttempt } from './records';

interface ListContext {
  native: boolean;
  projectId: string;
  refresh: number;
}
interface ListState {
  context: ListContext;
  records: StoredAttempt[];
  busy: boolean;
  error: string | null;
}
function initialState(context: ListContext): ListState {
  return {
    context,
    records: [],
    busy: context.native && context.projectId !== '',
    error: null,
  };
}

export function usePracticeRecords(native: boolean, projectId: string) {
  const [refresh, setRefresh] = useState(0);
  const context = useMemo(
    () => ({ native, projectId, refresh }),
    [native, projectId, refresh],
  );
  const [state, setState] = useState(() => initialState(context));
  const visible = state.context === context ? state : initialState(context);
  useEffect(() => {
    if (!context.native || !context.projectId) return;
    const controller = new AbortController();
    setState(initialState(context));
    void recordApi
      .list(context.projectId, controller.signal)
      .then((records) => {
        if (!controller.signal.aborted)
          setState({ context, records, busy: false, error: null });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setState({
            context,
            records: [],
            busy: false,
            error: projectError(cause),
          });
      });
    return () => controller.abort();
  }, [context]);
  return {
    records: visible.records,
    busy: visible.busy,
    error: visible.error,
    refresh: () => setRefresh((value) => value + 1),
  };
}
