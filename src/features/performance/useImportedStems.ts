import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GuitarPartRole } from '../../entities/score';
import { isGuitarPartRole } from '../../entities/guitarRoles';
import { LatestTask } from '../../shared/latestTask';
import type { JobSnapshot } from '../library/projects';
import {
  importedStemsApi,
  importedStemError,
  type ImportedGuitarStem,
} from './importedStems';
export function useImportedStems(
  projectId: string | undefined,
  locked: boolean,
) {
  const [role, setRole] = useState<GuitarPartRole>('UNKNOWN');
  const [items, setItems] = useState<ImportedGuitarStem[]>([]);
  const [preview, setPreview] = useState<{
    stem: ImportedGuitarStem;
    url: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [job, setJob] = useState<JobSnapshot | null>(null);
  const task = useRef(new LatestTask()),
    epoch = useRef(0),
    operation = useRef(false),
    mounted = useRef(false);
  const context = useMemo(() => ({ projectId }), [projectId]);
  const owner = useRef(context);
  const latestLocked = useRef(locked);
  const ownsContext = owner.current === context;
  useLayoutEffect(() => {
    const current = task.current;
    const generation = epoch;
    owner.current = context;
    mounted.current = true;
    generation.current++;
    current.cancel();
    setItems([]);
    setPreview(null);
    setError(null);
    setNotice(null);
    setJob(null);
    setRole('UNKNOWN');
    return () => {
      mounted.current = false;
      generation.current++;
      current.cancel();
    };
  }, [context]);
  useLayoutEffect(() => {
    latestLocked.current = locked;
    if (locked) {
      task.current.cancel();
      setPreview(null);
    }
  }, [locked]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  async function run(mode: 'import' | 'list' | 'read', id = '') {
    if (
      !mounted.current ||
      owner.current !== context ||
      !projectId ||
      latestLocked.current ||
      operation.current ||
      !importedStemsApi.available()
    )
      return;
    const current = epoch.current;
    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setJob(null);
    if (mode !== 'list') setPreview(null);
    const result = await task.current.run(async (signal) => {
      const progress = (value: JobSnapshot) => {
        if (epoch.current === current && !signal.aborted) setJob(value);
      };
      if (mode === 'import')
        return {
          kind: 'import' as const,
          stem: await importedStemsApi.import(
            projectId,
            role,
            signal,
            progress,
          ),
        };
      if (mode === 'list')
        return {
          kind: 'list' as const,
          stems: await importedStemsApi.list(projectId, signal, progress),
        };
      return {
        kind: 'read' as const,
        ...(await importedStemsApi.read(projectId, id, signal, progress)),
      };
    });
    operation.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (current !== epoch.current) return;
    if (result.status === 'error') setError(importedStemError(result.error));
    else if (result.status === 'canceled')
      setNotice(
        '기타 파일 작업을 취소했습니다. 저장 직후 취소했다면 목록을 다시 읽어 확인하세요.',
      );
    else if (result.value.kind === 'import') {
      const stem = result.value.stem;
      setItems((rows) => [stem, ...rows].slice(0, 20));
      setNotice(
        '사용자 기타 파일을 프로젝트에 복사했습니다. 원래 파일은 유지됩니다.',
      );
    } else if (result.value.kind === 'list') {
      setItems(result.value.stems);
      setNotice('저장한 사용자 기타 파일 목록을 읽었습니다.');
    } else {
      try {
        setPreview({
          stem: result.value.stem,
          url: URL.createObjectURL(
            new Blob([result.value.bytes], { type: 'audio/wav' }),
          ),
        });
      } catch {
        setError('기타 파일 미리 듣기를 준비하지 못했습니다.');
      }
    }
  }
  return {
    role: ownsContext ? role : 'UNKNOWN',
    items: ownsContext ? items : [],
    preview: ownsContext && !locked ? preview : null,
    busy,
    error: ownsContext ? error : null,
    notice: ownsContext ? notice : null,
    job: ownsContext ? job : null,
    available: !!projectId && !locked && importedStemsApi.available(),
    changeRole(value: string) {
      if (
        mounted.current &&
        owner.current === context &&
        !latestLocked.current &&
        !operation.current &&
        isGuitarPartRole(value)
      ) {
        task.current.cancel();
        setRole(value);
      }
    },
    import: () => run('import'),
    refresh: () => run('list'),
    read: (id: string) => run('read', id),
    cancel: () => {
      if (mounted.current && owner.current === context) task.current.cancel();
    },
  };
}
