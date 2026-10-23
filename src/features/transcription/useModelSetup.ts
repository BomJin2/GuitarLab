import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { LatestTask } from '../../shared/latestTask';
import { logDiagnostic } from '../../shared/logger';
import { aiRuntimeError } from './runtime';
import type { AiModelId } from './modelInstallation';
import {
  modelSetupApi,
  setupStages,
  type ModelSetupResult,
} from './modelSetup';

export function useModelSetup() {
  const [modelId, setModelId] = useState<AiModelId>('basic-pitch');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(setupStages[0]);
  const [result, setResult] = useState<ModelSetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const operation = useRef(false);
  const task = useRef(new LatestTask());
  const cancellation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const native = modelSetupApi.available();
  useEffect(() => {
    const current = task.current;
    mounted.current = true;
    const subscription = native
      ? listen('ai-installation-close-blocked', () => {
          if (mounted.current)
            setNotice(
              '설치가 진행 중입니다. 완료를 기다리거나 설치 취소 후 창을 닫아주세요.',
            );
        }).catch(() => {
          logDiagnostic('warn', 'AI_SETUP_LISTENER_FAILED');
          return null;
        })
      : null;
    return () => {
      mounted.current = false;
      current.cancel();
      void subscription
        ?.then((unlisten) => unlisten?.())
        .catch(() => logDiagnostic('warn', 'AI_SETUP_LISTENER_REMOVE_FAILED'));
    };
  }, [native]);
  return {
    modelId,
    selectModel: (id: AiModelId) => {
      if (!operation.current) {
        setModelId(id);
        setResult(null);
        setError(null);
        setNotice(null);
      }
    },
    busy,
    stage,
    result,
    error,
    notice,
    native,
    cancel: () => {
      setNotice('설치 취소와 새 임시 환경 정리를 기다리고 있습니다.');
      cancellation.current?.abort();
    },
    install: async () => {
      if (!native || operation.current) return;
      operation.current = true;
      setBusy(true);
      setStage(setupStages[0]);
      setResult(null);
      setError(null);
      setNotice(null);
      const controller = new AbortController();
      cancellation.current = controller;
      const outcome = await task.current.run(async (lifetime) => {
        const cancel = () => controller.abort();
        lifetime.addEventListener('abort', cancel, { once: true });
        try {
          return await modelSetupApi.install(
            controller.signal,
            (value) => {
              if (mounted.current && !controller.signal.aborted)
                setStage(value);
            },
            modelId,
          );
        } finally {
          lifetime.removeEventListener('abort', cancel);
        }
      });
      cancellation.current = null;
      operation.current = false;
      if (!mounted.current) return;
      setBusy(false);
      if (outcome.status === 'ready') {
        setResult(outcome.value);
        setNotice(null);
      } else if (
        outcome.status === 'error' &&
        !(
          outcome.error instanceof DOMException &&
          outcome.error.name === 'AbortError'
        )
      ) {
        setError(aiRuntimeError(outcome.error));
        setNotice(null);
      } else
        setNotice(
          '설치를 취소하고 새 임시 환경을 정리했습니다. 기존 환경과 검증 캐시는 유지합니다.',
        );
    },
  };
}
