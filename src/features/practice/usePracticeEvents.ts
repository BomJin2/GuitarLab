import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { projectError } from '../library/projects';
import { recordApi, type StoredAttempt, type StoredEvent } from './records';

type ReadStatus = 'IDLE' | 'LOADING' | 'READY' | 'CANCELLED' | 'ERROR';
interface ReadContext {
  record: StoredAttempt | undefined;
  retry: number;
}
interface ReadState {
  context: ReadContext;
  status: ReadStatus;
  events: StoredEvent[];
  loaded: number;
  error: string | null;
}
function initialState(context: ReadContext): ReadState {
  return {
    context,
    status: context.record ? 'LOADING' : 'IDLE',
    events: [],
    loaded: 0,
    error: null,
  };
}

export function usePracticeEvents(record: StoredAttempt | undefined) {
  const [retry, setRetry] = useState(0);
  const context = useMemo(() => ({ record, retry }), [record, retry]);
  const owner = useRef<ReadContext | null>(null);
  const active = useRef<AbortController | null>(null);
  const [state, setState] = useState(() => initialState(context));
  // 첫 반환부터 이전 시도의 결과를 숨기고, 같은 시도로 돌아와도 새 조회로 구분합니다.
  const visible = state.context === context ? state : initialState(context);

  useLayoutEffect(() => {
    owner.current = context;
    return () => {
      owner.current = null;
      active.current?.abort();
      active.current = null;
    };
  }, [context]);

  useEffect(() => {
    if (!context.record) return;
    const controller = new AbortController();
    active.current = controller;
    const current = () =>
      owner.current === context &&
      active.current === controller &&
      !controller.signal.aborted;
    setState(initialState(context));
    void recordApi
      .events(context.record, controller.signal, (loaded) => {
        if (current()) setState((value) => ({ ...value, loaded }));
      })
      .then((events) => {
        if (current())
          setState({
            context,
            status: 'READY',
            events,
            loaded: events.length,
            error: null,
          });
      })
      .catch((cause) => {
        if (current())
          setState({
            ...initialState(context),
            status: 'ERROR',
            error: projectError(cause),
          });
      });
    return () => {
      controller.abort();
      if (active.current === controller) active.current = null;
    };
  }, [context]);

  return {
    status: visible.status,
    events: visible.events,
    loaded: visible.loaded,
    error: visible.error,
    cancel: () => {
      if (owner.current !== context || visible.status !== 'LOADING') return;
      active.current?.abort();
      active.current = null;
      setState({ ...initialState(context), status: 'CANCELLED' });
    },
    retry: () => {
      if (
        owner.current === context &&
        (visible.status === 'CANCELLED' || visible.status === 'ERROR')
      )
        setRetry((value) => value + 1);
    },
  };
}
