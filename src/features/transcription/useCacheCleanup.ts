import { useEffect, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import {
  cacheCleanupApi,
  cacheCleanupError,
  type CacheUsage,
} from './cacheCleanup';
import type { AiModelId } from './modelInstallation';

export function useCacheCleanup() {
  const [modelId, setModelId] = useState<AiModelId>('basic-pitch');
  const [usage, setUsage] = useState<CacheUsage | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [percent, setPercent] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const task = useRef(new LatestTask()),
    operation = useRef(false),
    mounted = useRef(false);
  const native = cacheCleanupApi.available();
  useEffect(() => {
    mounted.current = true;
    const current = task.current;
    return () => {
      mounted.current = false;
      current.cancel();
    };
  }, []);
  async function run(remove: boolean) {
    if (
      !native ||
      operation.current ||
      (remove && (!consent || !usage || usage.files === 0))
    )
      return;
    const selected = usage;
    operation.current = true;
    setBusy(true);
    setCanceling(false);
    setPercent(0);
    setNotice(null);
    setConsent(false);
    setUsage(null);
    const outcome = await task.current.run(async (signal) => {
      if (remove && selected) {
        const result = await cacheCleanupApi.clear(
          selected,
          signal,
          (value) => {
            if (mounted.current) setPercent(value);
          },
        );
        return {
          usage: null,
          notice: `다운로드 캐시 ${result.removedFiles}개를 정리했습니다(파일 크기 합계 ${(result.removedBytes / 1048576).toFixed(1)}MiB). 설치 환경은 변경하지 않았습니다.`,
        };
      }
      return { usage: await cacheCleanupApi.inspect(modelId), notice: null };
    });
    operation.current = false;
    if (!mounted.current) return;
    setBusy(false);
    setCanceling(false);
    if (outcome.status === 'ready') {
      setUsage(outcome.value.usage);
      setNotice(outcome.value.notice);
    } else if (outcome.status === 'error')
      setNotice(cacheCleanupError(outcome.error, remove));
    else
      setNotice(
        '취소 처리를 마쳤습니다. 이미 지운 캐시는 복구하지 않으며 일부가 삭제됐을 수 있습니다. 다시 조회해주세요.',
      );
  }
  return {
    modelId,
    usage,
    consent,
    setConsent,
    busy,
    canceling,
    percent,
    notice,
    native,
    selectModel(id: AiModelId) {
      if (operation.current) return;
      setModelId(id);
      setUsage(null);
      setConsent(false);
      setNotice(null);
      setPercent(0);
    },
    inspect: () => run(false),
    clear: () => run(true),
    cancel() {
      if (operation.current) {
        setCanceling(true);
        task.current.cancel();
      }
    },
  };
}
