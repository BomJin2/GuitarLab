import { useEffect, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import type { JobSnapshot } from '../library/projects';
import { backingStorageError, projectBackingApi } from './projectBacking';
import { parseYoutubeUrl, type YoutubeSelection } from './youtube';

export function useProjectBacking(
  projectId: string | undefined,
  locked: boolean,
  restoreUrl: (value: string) => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stored, setStored] = useState<YoutubeSelection | null | undefined>(
    undefined,
  );
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const task = useRef(new LatestTask());
  const epoch = useRef(0);
  const operation = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    const current = task.current;
    const generation = epoch;
    mounted.current = true;
    generation.current++;
    current.cancel();
    setStored(undefined);
    setError(null);
    setNotice(null);
    setJob(null);
    return () => {
      mounted.current = false;
      generation.current++;
      current.cancel();
    };
  }, [projectId]);
  useEffect(() => {
    if (locked) task.current.cancel();
  }, [locked]);

  async function run(mode: 'load' | 'save' | 'clear', url = '') {
    if (
      !projectId ||
      locked ||
      operation.current ||
      !projectBackingApi.available()
    )
      return;
    let selection: YoutubeSelection | null = null;
    try {
      if (mode === 'save') selection = parseYoutubeUrl(url);
    } catch (cause) {
      setError(backingStorageError(cause));
      return;
    }
    const current = epoch.current;
    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setJob(null);
    const result = await task.current.run((signal) => {
      const progress = (value: JobSnapshot) => {
        if (epoch.current === current && !signal.aborted) setJob(value);
      };
      return mode === 'load'
        ? projectBackingApi.load(projectId, signal, progress)
        : projectBackingApi.save(
            { schemaVersion: 1, projectId, selection },
            signal,
            progress,
          );
    });
    operation.current = false;
    if (!mounted.current) return;
    if (epoch.current !== current) {
      setBusy(false);
      return;
    }
    setBusy(false);
    if (result.status === 'error') setError(backingStorageError(result.error));
    else if (result.status === 'canceled')
      setNotice(
        '주소 작업을 취소했습니다. 저장 직후 취소했다면 다시 읽어 확정값을 확인하세요.',
      );
    else {
      setStored(result.value.selection);
      if (mode === 'load')
        restoreUrl(
          result.value.selection
            ? `https://www.youtube.com/watch?v=${result.value.selection.videoId}`
            : '',
        );
      setNotice(
        mode === 'save'
          ? '영상 ID를 프로젝트에 저장했습니다. 영상 자체는 저장하지 않습니다.'
          : mode === 'clear'
            ? '프로젝트의 저장 주소를 삭제했습니다. 입력칸과 영상은 그대로입니다.'
            : '저장 주소를 읽었습니다. 직접 열기를 눌러야 YouTube에 연결합니다.',
      );
    }
  }
  return {
    busy,
    error,
    notice,
    stored,
    job,
    available: !!projectId && projectBackingApi.available() && !locked,
    load: () => run('load'),
    save: (url: string) => run('save', url),
    clear: () => run('clear'),
    cancel: () => task.current.cancel(),
  };
}
