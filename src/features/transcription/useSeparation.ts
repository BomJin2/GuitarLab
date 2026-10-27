import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ProjectController } from '../library/useProjects';
import { LatestTask } from '../../shared/latestTask';
import {
  separationApi,
  type SeparationInfo,
  type StemRole,
} from './separation';
import { transcriptionError } from './transcription';

export function useSeparation(
  project?: Pick<ProjectController, 'details' | 'audioAssetId' | 'busy'>,
) {
  const projectId = project?.details?.project.id,
    assetId = project?.audioAssetId;
  const task = useRef(new LatestTask()),
    generation = useRef(0),
    active = useRef(false),
    mounted = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    info: SeparationInfo;
    sources: { role: StemRole; url: string }[];
  } | null>(null);
  const context = useMemo(() => ({ projectId, assetId }), [projectId, assetId]);
  const owner = useRef(context);
  const ownsContext = owner.current === context;
  useLayoutEffect(() => {
    const current = task.current;
    owner.current = context;
    generation.current++;
    mounted.current = true;
    active.current = false;
    setBusy(false);
    setPreview(null);
    setError(null);
    setNotice(null);
    return () => {
      mounted.current = false;
      current.cancel();
    };
  }, [context]);
  useEffect(
    () => () => {
      preview?.sources.forEach((source) => URL.revokeObjectURL(source.url));
    },
    [preview],
  );
  async function run(mode: 'analyze' | 'restore') {
    if (
      !mounted.current ||
      owner.current !== context ||
      !projectId ||
      !assetId ||
      project?.busy ||
      active.current ||
      !separationApi.available()
    )
      return;
    const epoch = generation.current;
    active.current = true;
    setBusy(true);
    setPreview(null);
    setError(null);
    setNotice(null);
    const result = await task.current.run((signal) =>
      separationApi[mode]({ projectId, assetId }, signal),
    );
    if (
      !mounted.current ||
      owner.current !== context ||
      epoch !== generation.current
    )
      return;
    active.current = false;
    setBusy(false);
    if (result.status === 'ready') {
      if (!result.value) {
        setNotice('현재 음원에 저장된 분리 결과가 없습니다.');
        return;
      }
      const sources: { role: StemRole; url: string }[] = [];
      try {
        for (const item of result.value.audio)
          sources.push({
            role: item.role,
            url: URL.createObjectURL(
              new Blob([item.bytes], { type: 'audio/wav' }),
            ),
          });
        setPreview({ info: result.value.info, sources });
        setNotice(
          mode === 'analyze'
            ? '분리 결과를 프로젝트에 저장했습니다.'
            : '저장된 분리 결과를 불러왔습니다.',
        );
      } catch {
        sources.forEach((source) => URL.revokeObjectURL(source.url));
        setError('분리 결과 미리 듣기를 준비하지 못했습니다.');
      }
    } else if (result.status === 'error') {
      setError(transcriptionError(result.error));
    } else
      setNotice(
        '작업을 취소했습니다. 원본은 유지했습니다. 저장 직후의 취소라면 다시 불러오기로 저장 여부를 확인하세요.',
      );
  }
  return {
    busy: ownsContext && busy,
    error: ownsContext ? error : null,
    notice: ownsContext ? notice : null,
    preview: ownsContext ? preview : null,
    native: separationApi.available(),
    available: !!projectId && !!assetId && !project?.busy,
    analyze: () => run('analyze'),
    restore: () => run('restore'),
    cancel: () => {
      if (mounted.current && owner.current === context) task.current.cancel();
    },
  };
}
