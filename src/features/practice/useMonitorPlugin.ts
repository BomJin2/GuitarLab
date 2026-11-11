import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  emptyMonitorPlugin,
  monitorPluginApi,
  type MonitorPluginSnapshot,
  type ProjectPluginState,
} from './monitorPlugin';

const code = (cause: unknown) =>
  typeof cause === 'object' && cause !== null && 'code' in cause
    ? String((cause as { code: unknown }).code)
    : 'PLUGIN_LOAD_FAILED';

/** 불러오는 동안과 편집 창이 열린 동안만 1초마다 상태를 읽습니다(로드는 약 7초, 메모리 약 1GB). */
export function useMonitorPlugin(
  native: boolean,
  projectId?: string,
  /** 모니터 상태가 바뀌면(켜기·끄기) 플러그인의 사용 중 여부를 다시 읽습니다. */
  monitorState?: string,
) {
  const [state, setState] = useState<MonitorPluginSnapshot>(emptyMonitorPlugin);
  // 지금 열린 프로젝트에 저장된 톤의 요약(프로젝트를 바꾸면 다시 읽음).
  const [tone, setTone] = useState<ProjectPluginState | null>(null);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 톤 저장 응답이 늦게 와도 그 사이 바뀐 프로젝트에는 반영하지 않습니다.
  const currentProject = useRef(projectId);
  // 톤 조회·저장 공통 순번. 저장 뒤에 도착한 이전 조회 응답은 버립니다.
  const toneSeq = useRef(0);
  useLayoutEffect(() => {
    currentProject.current = projectId;
  }, [projectId]);
  useEffect(() => {
    if (!native) return;
    let canceled = false;
    void monitorPluginApi.status().then(
      (next) => !canceled && setState(next),
      (cause) => !canceled && setError(code(cause)),
    );
    return () => {
      canceled = true;
    };
  }, [native, monitorState]);
  useEffect(() => {
    // 사용자가 편집 창의 X로 닫은 것도 이 확인으로 알게 됩니다.
    if (!native || (state.state !== 'LOADING' && !state.editorOpen)) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (state.state === 'LOADING')
        setLoadingSeconds(Math.round((Date.now() - started) / 1000));
      void monitorPluginApi
        .status()
        .then(setState, (cause) => setError(code(cause)));
    }, 1000);
    return () => {
      clearInterval(timer);
      setLoadingSeconds(0);
    };
  }, [native, state.state, state.editorOpen]);
  useEffect(() => {
    setTone(null);
    if (!native || !projectId) return;
    let canceled = false;
    const seq = ++toneSeq.current;
    void monitorPluginApi.projectTone(projectId).then(
      (next) => !canceled && seq === toneSeq.current && setTone(next),
      (cause) => !canceled && setError(code(cause)),
    );
    return () => {
      canceled = true;
    };
  }, [native, projectId]);
  const run = useCallback(
    async (action: () => Promise<MonitorPluginSnapshot>) => {
      setBusy(true);
      setError(null);
      try {
        setState(await action());
      } catch (cause) {
        setError(code(cause));
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  return {
    state,
    error,
    busy,
    load: (sampleRate: number) => run(() => monitorPluginApi.load(sampleRate)),
    unload: () => run(() => monitorPluginApi.unload()),
    openEditor: () => run(() => monitorPluginApi.openEditor()),
    closeEditor: () => run(() => monitorPluginApi.closeEditor()),
    refresh: () => run(() => monitorPluginApi.status()),
    tone,
    loadingSeconds,
    saveTone: () =>
      projectId &&
      run(async () => {
        const seq = ++toneSeq.current;
        const saved = await monitorPluginApi.saveProjectTone(projectId);
        if (currentProject.current === projectId && seq === toneSeq.current)
          setTone(saved);
        return monitorPluginApi.status();
      }),
    restoreTone: () =>
      projectId && run(() => monitorPluginApi.restoreProjectTone(projectId)),
  };
}
