import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { aiRuntimeError } from './runtime';
import type { AiModelId } from './modelInstallation';
import { modelCacheApi, type ModelCacheInfo } from './modelCache';

type DownloadState = {
  modelId: AiModelId;
  selection: number;
  busy: boolean;
  percent: number;
  result: ModelCacheInfo | null;
  error: string | null;
  notice: string | null;
};
const initial: DownloadState = {
  modelId: 'basic-pitch',
  selection: 0,
  busy: false,
  percent: 0,
  result: null,
  error: null,
  notice: null,
};
// 다운로드는 화면 이동과 무관하게 계속되므로 상태를 컴포넌트 밖에 둡니다(앱 실행 중에만 유지).
// 네트워크 동의는 저장하지 않고 화면마다 새로 받습니다.
let state = initial;
let cancellation: AbortController | null = null;
const listeners = new Set<() => void>();
function update(patch: Partial<DownloadState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => state;
export function resetModelDownloadForTests() {
  cancellation?.abort();
  cancellation = null;
  state = initial;
}

export function useModelDownload() {
  const current = useSyncExternalStore(subscribe, snapshot);
  const [consent, setConsentState] = useState(false);
  const approval = useRef(false);
  const mounted = useRef(false);
  // 선택 세대. 선택이 바뀌거나(같은 모델로 돌아와도) 화면을 떠난 뒤의 이전 함수는 새 작업을 시작하지 않습니다.
  const context = current.selection;
  const owner = useRef<number | null>(context);
  const ownsContext = () => mounted.current && owner.current === context;
  useLayoutEffect(() => {
    owner.current = context;
  }, [context]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      approval.current = false;
    };
  }, []);
  return {
    modelId: current.modelId,
    selectModel: (id: AiModelId) => {
      if (!ownsContext() || cancellation) return;
      if (id !== current.modelId) owner.current = null;
      approval.current = false;
      setConsentState(false);
      update({
        modelId: id,
        selection: current.selection + 1,
        result: null,
        error: null,
        notice: null,
        percent: 0,
      });
    },
    consent,
    setConsent: (value: boolean) => {
      if (!ownsContext() || cancellation) return;
      approval.current = value;
      setConsentState(value);
    },
    busy: current.busy,
    percent: current.percent,
    result: current.result,
    error: current.error,
    notice: current.notice,
    native: modelCacheApi.available(),
    cancel: () => {
      if (ownsContext()) cancellation?.abort();
    },
    download: async () => {
      if (
        !ownsContext() ||
        !approval.current ||
        cancellation ||
        !modelCacheApi.available()
      )
        return;
      const controller = new AbortController();
      cancellation = controller;
      approval.current = false;
      setConsentState(false);
      const modelId = current.modelId;
      update({
        busy: true,
        percent: 0,
        result: null,
        error: null,
        notice: null,
      });
      try {
        const result = await modelCacheApi.download(
          true,
          controller.signal,
          (value) => {
            if (!controller.signal.aborted) update({ percent: value });
          },
          modelId,
        );
        if (cancellation !== controller) return;
        if (controller.signal.aborted)
          update({
            notice:
              '다운로드를 취소했습니다. 검증된 캐시는 다음 시도에 재사용합니다.',
          });
        else update({ result });
      } catch (cause) {
        if (cancellation !== controller) return;
        if (
          controller.signal.aborted ||
          (cause instanceof DOMException && cause.name === 'AbortError')
        )
          update({
            notice:
              '다운로드를 취소했습니다. 검증된 캐시는 다음 시도에 재사용합니다.',
          });
        else update({ error: aiRuntimeError(cause) });
      } finally {
        if (cancellation === controller) {
          cancellation = null;
          update({ busy: false });
        }
      }
    },
  };
}
