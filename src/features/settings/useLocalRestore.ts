import { useCallback, useEffect, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import type { JobSnapshot } from '../library/projects';
import {
  localRestoreApi,
  restoreError,
  type LocalRestoreStatus,
} from './localRestore';

export function useLocalRestore() {
  const native = localRestoreApi.available();
  const [consent, setConsentState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<LocalRestoreStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const mounted = useRef(false),
    operation = useRef(false),
    approval = useRef(false);
  const task = useRef(new LatestTask());
  const query = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++query.current;
    try {
      const value = await localRestoreApi.status();
      if (mounted.current && sequence === query.current) setStatus(value);
    } catch {
      if (mounted.current && sequence === query.current) {
        setStatus(null);
        setNotice(restoreError());
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const current = task.current;
    if (native) void refresh();
    return () => {
      mounted.current = false;
      query.current += 1;
      current.cancel();
    };
  }, [native, refresh]);
  async function run(cancelReservation = false) {
    if (
      !mounted.current ||
      operation.current ||
      !native ||
      (!cancelReservation && !approval.current) ||
      (cancelReservation && status?.state !== 'SCHEDULED')
    )
      return;
    operation.current = true;
    query.current += 1;
    setBusy(true);
    setNotice(null);
    setJob(null);
    const id = status && status.state !== 'IDLE' ? status.recoveryId : '';
    const outcome = await task.current.run((signal) => {
      const progress = (next: JobSnapshot) => {
        if (mounted.current && !signal.aborted) setJob(next);
      };
      return cancelReservation
        ? localRestoreApi.cancel(id, signal, progress)
        : localRestoreApi.schedule(signal, progress);
    });
    // 늦은 취소가 예약 게시 뒤 도착했을 수 있으므로 성공/실패와 별도로 조회합니다.
    if (mounted.current) {
      if (outcome.status === 'ready') setStatus(outcome.value);
      else
        setNotice(
          outcome.status === 'canceled'
            ? '작업 취소 후 실제 예약 상태를 다시 확인했습니다.'
            : restoreError(),
        );
      await refresh();
    }
    operation.current = false;
    if (mounted.current) setBusy(false);
  }
  return {
    native,
    consent,
    busy,
    status,
    notice,
    job,
    setConsent(value: boolean) {
      if (!operation.current) {
        approval.current = value;
        setConsentState(value);
      }
    },
    refresh: () => {
      if (!operation.current && mounted.current) return refresh();
    },
    schedule: () => run(),
    cancelReservation: () => run(true),
    cancelJob() {
      if (operation.current) task.current.cancel();
    },
  };
}
