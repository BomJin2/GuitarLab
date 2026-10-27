import { useLayoutEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { LatestTask } from '../../shared/latestTask';
import { logDiagnostic } from '../../shared/logger';
import {
  backupError,
  localBackupApi,
  type LocalBackupResult,
  type LocalBackupMode,
} from './localBackup';
import type { JobSnapshot } from '../library/projects';

export function useLocalBackup() {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [result, setResult] = useState<LocalBackupResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<LocalBackupMode>('CREATE');
  const task = useRef(new LatestTask());
  const operation = useRef(false),
    mounted = useRef(false);
  const approval = useRef(false);
  const native = localBackupApi.available();
  useLayoutEffect(() => {
    mounted.current = true;
    const current = task.current;
    const subscription = native
      ? listen('backup-close-blocked', () => {
          if (mounted.current)
            setNotice(
              '백업·로컬 파일 작업 또는 취소 정리가 끝난 뒤 창을 닫아주세요.',
            );
        }).catch(() => {
          if (mounted.current)
            setNotice(
              '종료 안내 연결을 확인하지 못했습니다. 백업을 마친 뒤 창을 닫아주세요.',
            );
          return null;
        })
      : null;
    return () => {
      mounted.current = false;
      current.cancel();
      void subscription
        ?.then((unlisten) => unlisten?.())
        .catch(() => logDiagnostic('warn', 'BACKUP_LISTENER_REMOVE_FAILED'));
    };
  }, [native]);
  async function start(nextMode: LocalBackupMode = 'CREATE') {
    if (
      !mounted.current ||
      operation.current ||
      (nextMode !== 'VERIFY' && !approval.current) ||
      !native
    )
      return;
    operation.current = true;
    setMode(nextMode);
    setBusy(true);
    setCanceling(false);
    setResult(null);
    setNotice(null);
    setJob(null);
    const action = {
      CREATE: localBackupApi.create,
      VERIFY: localBackupApi.verify,
      PREVIEW: localBackupApi.preview,
    }[nextMode];
    const outcome = await task.current.run((signal) =>
      action(signal, (value) => {
        if (mounted.current && !signal.aborted) setJob(value);
      }),
    );
    operation.current = false;
    if (!mounted.current) return;
    setBusy(false);
    setCanceling(false);
    if (outcome.status === 'ready') setResult(outcome.value);
    if (outcome.status === 'error') setNotice(backupError(outcome.error));
    if (outcome.status === 'canceled')
      setNotice('취소 처리를 마쳤습니다. 이미 완성된 ZIP이 있으면 보존됩니다.');
  }
  return {
    native,
    consent,
    setConsent: (value: boolean) => {
      if (!mounted.current || operation.current) return;
      approval.current = value;
      setConsent(value);
    },
    busy,
    canceling,
    job,
    result,
    notice,
    start,
    mode,
    verify: () => start('VERIFY'),
    preview: () => start('PREVIEW'),
    cancel() {
      if (mounted.current && operation.current) {
        setCanceling(true);
        task.current.cancel();
      }
    },
  };
}
