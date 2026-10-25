import { useEffect, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import type { JobSnapshot } from '../library/projects';
import type { RecordedTake } from './recordings';
import { takeExportApi, takeExportError } from './takeExport';

export function useTakeExport(take: RecordedTake) {
  const task = useRef(new LatestTask());
  const active = useRef(false);
  const mounted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    const current = task.current;
    return () => {
      mounted.current = false;
      current.cancel();
    };
  }, []);
  async function exportTake() {
    if (active.current || !takeExportApi.available() || take.state !== 'READY')
      return;
    active.current = true;
    setBusy(true);
    setCanceling(false);
    setJob(null);
    setError(null);
    setMessage(null);
    const result = await task.current.run((signal) =>
      takeExportApi.export(take, signal, (value) => {
        if (mounted.current && !signal.aborted) setJob(value);
      }),
    );
    active.current = false;
    if (!mounted.current) return;
    setBusy(false);
    setCanceling(false);
    if (result.status === 'ready')
      setMessage(
        `원본과 동일한 새 WAV로 ${result.value.bytes.toLocaleString('ko-KR')}바이트를 저장했습니다.`,
      );
    if (result.status === 'error') setError(takeExportError(result.error));
    if (result.status === 'canceled')
      setMessage(
        '내보내기를 취소했습니다. 이미 저장을 마친 파일은 유지됩니다.',
      );
  }
  return {
    busy,
    canceling,
    job,
    message,
    error,
    available: takeExportApi.available(),
    exportTake,
    cancel() {
      if (active.current) {
        setCanceling(true);
        task.current.cancel();
      }
    },
  };
}
