import { useLayoutEffect, useRef, useState } from 'react';
import type { ScoreDocument } from '../../entities/score';
import type { JobSnapshot } from '../library/projects';
import { LatestTask } from '../../shared/latestTask';
import {
  scoreExportApi,
  scoreExportError,
  type ScoreExportFormat,
} from './scoreExport';

// source는 파일 읽기가 아닌 작업 취소·상태 초기화의 문맥 식별자입니다.
export function useScoreExport(source: object) {
  const native = scoreExportApi.available();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const task = useRef(new LatestTask());
  const operation = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const current = task.current;
    const generation = epoch;
    mounted.current = true;
    generation.current++;
    operation.current = false;
    setBusy(false);
    setError(null);
    setNotice(null);
    setJob(null);
    return () => {
      mounted.current = false;
      generation.current++;
      current.cancel();
    };
  }, [source]);
  return {
    native,
    busy,
    error,
    notice,
    job,
    export: async (document: ScoreDocument, format: ScoreExportFormat) => {
      if (!native || operation.current) return;
      operation.current = true;
      const generation = epoch.current;
      setBusy(true);
      setError(null);
      setNotice(null);
      setJob(null);
      const result = await task.current.run((signal) =>
        scoreExportApi.export(document, format, signal, (next) => {
          if (mounted.current && generation === epoch.current) setJob(next);
        }),
      );
      if (!mounted.current || generation !== epoch.current) return;
      operation.current = false;
      setBusy(false);
      if (result.status === 'ready')
        setNotice(
          `새 ${format} 파일로 저장했습니다 · ${result.value.bytes.toLocaleString()}바이트`,
        );
      else if (result.status === 'error')
        setError(scoreExportError(result.error));
      else
        setNotice(
          '출력 취소를 요청했습니다. 이미 저장된 파일은 유지될 수 있습니다.',
        );
    },
    cancel: () => task.current.cancel(),
  };
}
