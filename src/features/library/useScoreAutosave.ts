import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScoreSession } from '../score/scoreSession';
import { usePlayer } from '../player/usePlayer';
import type { ProjectController } from './useProjects';
import {
  readScoreAutosavePreference,
  writeScoreAutosavePreference,
} from './scoreAutosavePreference';

type AutosaveProject = Pick<
  ProjectController,
  'native' | 'details' | 'busy' | 'scoreSaved' | 'error' | 'save'
>;

export function useScoreAutosave(
  project: AutosaveProject,
  session: ScoreSession | null,
  locked: boolean,
) {
  const { engine, state } = usePlayer();
  const [choice, setChoice] = useState<{
    projectId: string;
    enabled: boolean;
    error: string | null;
  } | null>(null);
  const [saveFailure, setSaveFailure] = useState<{
    projectId: string | undefined;
    message: string;
  } | null>(null);
  const attempted = useRef<{
    projectId: string | undefined;
    document: ScoreSession['document'];
  } | null>(null);
  const projectId = project.details?.project.id;
  const failure =
    saveFailure?.projectId === projectId ? saveFailure?.message : null;
  const stored = useMemo(() => {
    if (!project.native || !projectId) return { enabled: false, error: null };
    try {
      return { enabled: readScoreAutosavePreference(projectId), error: null };
    } catch {
      return {
        enabled: false,
        error:
          '자동 저장 설정을 읽지 못해 기본 꺼짐으로 표시합니다. 저장된 설정은 변경하지 않았습니다.',
      };
    }
  }, [project.native, projectId]);
  const selection = choice && choice.projectId === projectId ? choice : stored;
  const enabled = !!projectId && selection.enabled;
  const bound = Boolean(
    project.native &&
      projectId &&
      project.details?.revision &&
      session?.document.renderSource === 'NORMALIZED' &&
      session.savedRevision?.projectId === projectId &&
      session.savedRevision?.revisionId ===
        project.details?.revision?.revisionId &&
      session.originalAssetId === project.details?.revision?.scoreAssetId,
  );
  const ready =
    enabled &&
    bound &&
    !project.scoreSaved &&
    !project.busy &&
    !locked &&
    !project.error &&
    !failure &&
    (state.status === 'empty' || state.status === 'paused');
  const document = session?.document;
  const current = useRef({ ready, document, projectId, save: project.save });
  current.current = { ready, document, projectId, save: project.save };
  useEffect(() => {
    if (
      !ready ||
      !document ||
      (attempted.current?.projectId === projectId &&
        attempted.current?.document === document)
    )
      return;
    let canceled = false;
    const timer = window.setTimeout(() => {
      const latest = current.current;
      const status = engine.getSnapshot().status;
      if (
        !latest.ready ||
        latest.document !== document ||
        latest.projectId !== projectId ||
        (status !== 'empty' && status !== 'paused')
      )
        return;
      // 실패·취소된 같은 편집을 자동으로 계속 저장하지 않습니다.
      attempted.current = { projectId, document };
      void latest.save().catch(() => {
        if (!canceled)
          setSaveFailure({
            projectId,
            message: '자동 저장하지 못했습니다. 프로젝트 저장으로 확인하세요.',
          });
      });
    }, 30000);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [ready, document, projectId, engine]);
  return {
    available: project.native && !!projectId,
    enabled,
    blocked: locked || project.busy,
    preferenceError: selection.error,
    notice:
      failure ??
      (project.error
        ? '오류를 해결하고 프로젝트 저장으로 확인하세요. 자동 저장은 대기합니다.'
        : !bound
          ? '편집 악보를 프로젝트에 한 번 저장한 뒤 사용할 수 있습니다.'
          : '켜면 정지 상태에서 적용 변경 후 30초 뒤 새 버전을 저장합니다. 프로젝트별 선택은 다음 실행에도 복원하며 이전 버전은 삭제하지 않습니다.'),
    setEnabled(value: boolean) {
      if (!project.native || !projectId) return;
      attempted.current = null;
      setSaveFailure(null);
      try {
        writeScoreAutosavePreference(projectId, value);
        setChoice({ projectId, enabled: value, error: null });
      } catch {
        setChoice({
          projectId,
          enabled: value,
          error:
            '자동 저장 선택을 보존하지 못했습니다. 현재 선택은 이번 실행에만 적용하며 다음 실행에는 다를 수 있습니다.',
        });
      }
    },
  };
}

export type ScoreAutosaveController = ReturnType<typeof useScoreAutosave>;
