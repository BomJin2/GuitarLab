import { useEffect, useRef, useState } from 'react';
import { LatestTask } from '../../shared/latestTask';
import type { JobSnapshot } from '../library/projects';
import {
  projectYoutubeSyncApi,
  youtubeSyncStorageError,
  type YoutubeSyncKey,
  type YoutubeSyncProfile,
} from './projectYoutubeSync';

export function useYoutubeSyncStorage(
  key: YoutubeSyncKey | null,
  locked: boolean,
  restore: (profile: YoutubeSyncProfile | null) => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const task = useRef(new LatestTask());
  const epoch = useRef(0);
  const operation = useRef(false);
  const mounted = useRef(false);
  const scope = JSON.stringify(key);
  useEffect(() => {
    const current = task.current;
    const generation = epoch;
    mounted.current = true;
    generation.current++;
    current.cancel();
    setError(null);
    setNotice(null);
    setJob(null);
    return () => {
      mounted.current = false;
      generation.current++;
      current.cancel();
    };
  }, [scope]);
  useEffect(() => {
    if (locked) task.current.cancel();
  }, [locked]);
  async function run(
    mode: 'load' | 'save' | 'clear',
    profile: YoutubeSyncProfile | null = null,
  ) {
    if (
      !key ||
      locked ||
      operation.current ||
      !projectYoutubeSyncApi.available()
    )
      return;
    const current = epoch.current;
    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setJob(null);
    const result = await task.current.run(async (signal) => {
      const progress = (value: JobSnapshot) => {
        if (epoch.current === current && !signal.aborted) setJob(value);
      };
      return mode === 'load'
        ? projectYoutubeSyncApi.load(key, signal, progress)
        : projectYoutubeSyncApi.save({ ...key, profile }, signal, progress);
    });
    operation.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (epoch.current !== current) return;
    if (result.status === 'error')
      setError(youtubeSyncStorageError(result.error));
    else if (result.status === 'canceled')
      setNotice(
        '맞춤 작업을 취소했습니다. 저장 직후 취소했다면 다시 읽어 확인하세요.',
      );
    else {
      try {
        if (mode === 'load') restore(result.value.profile);
        setNotice(
          mode === 'save'
            ? '영상 맞춤을 프로젝트에 저장했습니다.'
            : mode === 'clear'
              ? '현재 악보·영상·트랙의 저장 맞춤을 삭제했습니다. 화면 임시 적용은 유지합니다.'
              : result.value.profile
                ? '저장 맞춤을 읽고 적용했습니다.'
                : '현재 악보·영상·트랙에 저장된 맞춤이 없습니다.',
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : '저장 맞춤을 적용하지 못했습니다.',
        );
      }
    }
  }
  return {
    busy,
    error,
    notice,
    job,
    available: !!key && !locked && projectYoutubeSyncApi.available(),
    load: () => run('load'),
    save: (profile: YoutubeSyncProfile) => run('save', profile),
    clear: () => run('clear'),
    cancel: () => task.current.cancel(),
  };
}
