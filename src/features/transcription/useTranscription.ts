import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ScoreSession } from '../score/scoreSession';
import type { ProjectController } from '../library/useProjects';
import { prepareEditingDocument } from '../score/normalizedNotation';
import { getActiveTrackIndex } from '../score/trackSelection';
import { LatestTask } from '../../shared/latestTask';
import { separationApi } from './separation';
import type { ImportedGuitarStem } from '../performance/importedStems';
import {
  draftPreview,
  transcriptionApi,
  transcriptionError,
  type AiDraft,
} from './transcription';

export function useTranscription(
  session: ScoreSession | null,
  project?: Pick<ProjectController, 'details' | 'audioAssetId' | 'busy'>,
  importedStem?: ImportedGuitarStem,
) {
  const projectId = project?.details?.project.id,
    assetId = project?.audioAssetId;
  const document = session?.document,
    trackIndex = session ? getActiveTrackIndex(session) : 0;
  const task = useRef(new LatestTask()),
    generation = useRef(0),
    active = useRef(false),
    mounted = useRef(false);
  const [busy, setBusy] = useState(false),
    [source, setSource] = useState<'original' | 'guitar' | 'imported'>(
      'original',
    ),
    [draft, setDraft] = useState<AiDraft | null>(null),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const selectedImported =
    importedStem?.projectId === projectId ? importedStem : undefined;
  const importedStemId =
    source === 'imported' ? selectedImported?.id : undefined;
  const importedReady =
    !!selectedImported &&
    selectedImported.durationMs <= 60000 &&
    selectedImported.bytes <= 64 * 1024 * 1024;
  const context = useMemo(
    () => ({
      document,
      trackIndex,
      projectId,
      assetId,
      source,
      importedStemId,
    }),
    [document, trackIndex, projectId, assetId, source, importedStemId],
  );
  const owner = useRef(context);
  const ownsContext = owner.current === context;
  const visibleDraft = ownsContext ? draft : null;
  useLayoutEffect(() => {
    const current = task.current;
    owner.current = context;
    generation.current++;
    mounted.current = true;
    active.current = false;
    setBusy(false);
    setDraft(null);
    setError(null);
    setNotice(null);
    return () => {
      mounted.current = false;
      current.cancel();
    };
  }, [context]);
  const preview = useMemo(() => {
    if (!session || !visibleDraft) return { value: null, error: null };
    try {
      return { value: draftPreview(session, visibleDraft), error: null };
    } catch (cause) {
      return {
        value: null,
        error:
          cause instanceof Error
            ? cause.message
            : 'TAB 미리보기를 만들지 못했습니다. 아래 표를 확인하세요.',
      };
    }
  }, [session, visibleDraft]);
  async function run(mode: 'analyze' | 'restore') {
    if (
      !mounted.current ||
      owner.current !== context ||
      !session ||
      !projectId ||
      !assetId ||
      (source === 'imported' && !importedReady) ||
      project?.busy ||
      active.current ||
      !transcriptionApi.available()
    )
      return;
    const epoch = generation.current;
    active.current = true;
    setBusy(true);
    setDraft(null);
    setError(null);
    setNotice(null);
    const result = await task.current.run(async (signal) => {
      const prepared = prepareEditingDocument(session),
        track = prepared.tracks[trackIndex];
      if (!track) throw new Error('AI_INPUT_INVALID');
      let stemId: string | undefined;
      if (source === 'guitar') {
        const separation = await separationApi.restore(
          { projectId, assetId },
          signal,
        );
        if (signal.aborted) throw new DOMException('분석 취소', 'AbortError');
        if (
          !separation ||
          separation.info.projectId !== projectId ||
          separation.info.assetId !== assetId
        )
          throw new Error('AI_STEM_NOT_FOUND');
        stemId = separation.info.stems.find(
          (stem) => stem.role === 'GUITAR_FULL',
        )?.id;
        if (!stemId) throw new Error('AI_STEM_NOT_FOUND');
      }
      return transcriptionApi[mode](
        {
          projectId,
          assetId,
          ...(stemId ? { stemId } : {}),
          ...(importedStemId ? { importedStemId } : {}),
          tuningMidi: track.tuningMidi,
          syncAnchors: prepared.syncAnchors,
          grid: 240,
        },
        signal,
      );
    });
    if (
      !mounted.current ||
      owner.current !== context ||
      epoch !== generation.current
    )
      return;
    active.current = false;
    setBusy(false);
    if (result.status === 'ready') {
      setDraft(result.value);
      if (!result.value)
        setNotice('현재 음원·튜닝·싱크 설정에 보존된 초안이 없습니다.');
    } else if (result.status === 'error')
      setError(transcriptionError(result.error));
    else setNotice('분석을 취소했습니다. 원본은 유지했습니다.');
  }
  return {
    busy: ownsContext && busy,
    source,
    selectSource: (value: 'original' | 'guitar' | 'imported') => {
      if (mounted.current && owner.current === context && !active.current)
        setSource(value);
    },
    draft: visibleDraft,
    error: ownsContext ? error : null,
    notice: ownsContext ? notice : null,
    preview,
    native: transcriptionApi.available(),
    available:
      !!session &&
      !!projectId &&
      !!assetId &&
      !project?.busy &&
      (source !== 'imported' || importedReady),
    analyze: () => run('analyze'),
    restore: () => run('restore'),
    cancel: () => {
      if (mounted.current && owner.current === context) task.current.cancel();
    },
  };
}
