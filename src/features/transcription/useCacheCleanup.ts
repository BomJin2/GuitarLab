import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  const approval = useRef(false);
  const latestUsage = useRef<CacheUsage | null>(null);
  const context = useMemo(() => ({ modelId }), [modelId]);
  const owner = useRef<typeof context | null>(context);
  const ownsContext = () => mounted.current && owner.current === context;
  useLayoutEffect(() => {
    owner.current = context;
    mounted.current = true;
    const current = task.current;
    return () => {
      mounted.current = false;
      current.cancel();
    };
  }, [context]);
  async function run(remove: boolean) {
    const selected = latestUsage.current;
    if (
      !ownsContext() ||
      !native ||
      operation.current ||
      (remove && (!approval.current || !selected || selected.files === 0))
    )
      return;
    operation.current = true;
    approval.current = false;
    latestUsage.current = null;
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
            if (ownsContext() && !signal.aborted) setPercent(value);
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
    if (!ownsContext()) return;
    setBusy(false);
    setCanceling(false);
    if (outcome.status === 'ready') {
      latestUsage.current = outcome.value.usage;
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
    setConsent: (value: boolean) => {
      if (!ownsContext() || operation.current || !latestUsage.current?.files)
        return;
      approval.current = value;
      setConsent(value);
    },
    busy,
    canceling,
    percent,
    notice,
    native,
    selectModel(id: AiModelId) {
      if (!ownsContext() || operation.current) return;
      if (id !== modelId) owner.current = null;
      setModelId(id);
      approval.current = false;
      latestUsage.current = null;
      setUsage(null);
      setConsent(false);
      setNotice(null);
      setPercent(0);
    },
    inspect: () => run(false),
    clear: () => run(true),
    cancel() {
      if (ownsContext() && operation.current) {
        setCanceling(true);
        task.current.cancel();
      }
    },
  };
}
