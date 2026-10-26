import { useLayoutEffect, useMemo, useState } from 'react';
import type { RevisionDocument } from './projects';
import {
  renderNormalized,
  scoreXmlLimitMessage,
} from '../score/normalizedNotation';

export function useRevisionScorePreview(revision: RevisionDocument) {
  const [requested, setRequested] = useState<RevisionDocument | null>(null);
  useLayoutEffect(() => setRequested(null), [revision]);
  const eligible = revision.score.renderSource === 'NORMALIZED';
  const open = eligible && requested === revision;
  const result = useMemo(() => {
    if (!open) return { value: null, error: null };
    try {
      return { value: renderNormalized(revision.score), error: null };
    } catch (cause) {
      return {
        value: null,
        error:
          cause instanceof Error && cause.message === 'SCORE_XML_LIMIT'
            ? scoreXmlLimitMessage
            : '저장 편집본의 TAB를 만들지 못했습니다. 기본 단성 6줄 편집 범위와 음표 정보를 확인하세요. 아래 표와 원본은 유지했습니다.',
      };
    }
  }, [open, revision]);
  return {
    ...result,
    eligible,
    open,
    show: () => {
      if (eligible) setRequested(revision);
    },
    hide: () => setRequested(null),
  };
}
