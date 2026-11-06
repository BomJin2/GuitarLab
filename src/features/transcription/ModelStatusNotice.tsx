import { useEffect, useState } from 'react';
import {
  modelStatusApi,
  type ModelState,
  type ModelStatusId,
} from './modelStatus';

/** 패널이 열릴 때 한 번 조회해 미설치·손상만 알립니다. 실행 버튼은 막지 않습니다. */
export function ModelStatusNotice({ modelId }: { modelId: ModelStatusId }) {
  const [state, setState] = useState<ModelState | null>(null);
  useEffect(() => {
    if (!modelStatusApi.available()) return;
    let alive = true;
    modelStatusApi
      .get()
      .then((all) => {
        if (alive) setState(all[modelId]);
      })
      // 조회 실패는 표시하지 않고 기존 실행 오류 안내에 맡깁니다.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [modelId]);
  if (state !== 'MISSING' && state !== 'DAMAGED') return null;
  return (
    <p role="status" className="model-status-notice">
      {state === 'MISSING'
        ? 'AI 모델이 설치되지 않았습니다 · '
        : 'AI 모델 환경을 확인해야 합니다 · '}
      <a href="#/settings">
        {state === 'MISSING' ? '환경 설정에서 설치' : '환경 설정에서 재검증'}
      </a>
    </p>
  );
}
