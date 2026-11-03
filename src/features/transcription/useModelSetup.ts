import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { listen } from '@tauri-apps/api/event';
import { logDiagnostic } from '../../shared/logger';
import { aiRuntimeError } from './runtime';
import type { AiModelId } from './modelInstallation';
import {
  modelSetupApi,
  setupStages,
  type ModelSetupResult,
} from './modelSetup';

type SetupState = {
  modelId: AiModelId;
  selection: number;
  busy: boolean;
  stage: string;
  result: ModelSetupResult | null;
  error: string | null;
  notice: string | null;
};
const initial: SetupState = {
  modelId: 'basic-pitch',
  selection: 0,
  busy: false,
  stage: setupStages[0] ?? '',
  result: null,
  error: null,
  notice: null,
};
// 설치는 화면 이동과 무관하게 계속되므로 상태를 컴포넌트 밖에 둡니다(앱 실행 중에만 유지).
let state = initial;
let cancellation: AbortController | null = null;
let closeListener: Promise<unknown> | null = null;
const listeners = new Set<() => void>();
function update(patch: Partial<SetupState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => state;
export function resetModelSetupForTests() {
  cancellation?.abort();
  cancellation = null;
  closeListener = null;
  state = initial;
}

export function useModelSetup() {
  const current = useSyncExternalStore(subscribe, snapshot);
  const native = modelSetupApi.available();
  const mounted = useRef(false);
  // 이 렌더의 선택 세대. 선택이 바뀌거나(같은 모델로 돌아와도) 화면을 떠난 뒤의 이전 함수는 새 작업을 시작하지 않습니다.
  const context = current.selection;
  const owner = useRef<number | null>(context);
  const ownsContext = () => mounted.current && owner.current === context;
  useLayoutEffect(() => {
    owner.current = context;
  }, [context]);
  useLayoutEffect(() => {
    mounted.current = true;
    if (native && !closeListener)
      closeListener = listen('ai-installation-close-blocked', () =>
        update({
          notice:
            '설치가 진행 중입니다. 완료를 기다리거나 설치 취소 후 창을 닫아주세요.',
        }),
      ).catch(() => {
        logDiagnostic('warn', 'AI_SETUP_LISTENER_FAILED');
        closeListener = null;
      });
    return () => {
      mounted.current = false;
    };
  }, [native]);
  return {
    ...current,
    native,
    selectModel: (id: AiModelId) => {
      if (ownsContext() && !cancellation) {
        if (id !== current.modelId) owner.current = null;
        update({
          modelId: id,
          selection: current.selection + 1,
          result: null,
          error: null,
          notice: null,
        });
      }
    },
    cancel: () => {
      if (!ownsContext() || !cancellation) return;
      update({ notice: '설치 취소와 새 임시 환경 정리를 기다리고 있습니다.' });
      cancellation.abort();
    },
    install: async () => {
      if (!ownsContext() || !native || cancellation) return;
      const controller = new AbortController();
      cancellation = controller;
      const modelId = current.modelId;
      update({
        busy: true,
        stage: setupStages[0],
        result: null,
        error: null,
        notice: null,
      });
      try {
        const result = await modelSetupApi.install(
          controller.signal,
          (value) => {
            if (!controller.signal.aborted) update({ stage: value });
          },
          modelId,
        );
        if (cancellation === controller) update({ result, notice: null });
      } catch (cause) {
        if (cancellation !== controller) return;
        if (cause instanceof DOMException && cause.name === 'AbortError')
          update({
            notice:
              '설치를 취소하고 새 임시 환경을 정리했습니다. 기존 환경과 검증 캐시는 유지합니다.',
          });
        else update({ error: aiRuntimeError(cause), notice: null });
      } finally {
        if (cancellation === controller) {
          cancellation = null;
          update({ busy: false });
        }
      }
    },
  };
}
