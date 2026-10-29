import { useState } from 'react';
import type { PurgePlan } from './projectPurge';

export function ProjectPurgeForm({
  plan,
  busy,
  onPurge,
}: {
  plan: PurgePlan;
  busy: boolean;
  onPurge: (plan: PurgePlan, title: string, consent: boolean) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  return (
    <section aria-label={`영구 삭제 확인 · ${plan.title}`}>
      <p>
        {plan.files.toLocaleString('ko-KR')}개 관리 파일 · 논리 크기{' '}
        {plan.logicalBytes.toLocaleString('ko-KR')}바이트 · 외부 참조{' '}
        {plan.externalReferences.toLocaleString('ko-KR')}개는 삭제하지 않습니다.
        실제 회수 공간이 아닙니다.
      </p>
      <p>
        관리 폴더 안 파일(미분류 파일 포함)과 악보·녹음·연습 기록을 영구
        삭제하며 앱에서 복원할 수 없습니다. 중단해도 이미 지운 파일은 되돌리지
        않습니다. 필요한 자료는 별도 백업을 보존하세요.
      </p>
      {plan.purgeStarted && (
        <p role="alert">
          삭제 시작 기록이 있습니다. 새로 확인한 남은 대상만 삭제를 재개합니다.
        </p>
      )}
      <label>
        삭제할 프로젝트 제목 직접 입력{' '}
        <input
          value={title}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={(event) => setConsent(event.target.checked)}
        />
        이 프로젝트의 관리 파일과 기록을 영구 삭제하는 데 동의합니다.
      </label>
      <button
        disabled={busy || title !== plan.title || !consent}
        onClick={() => void onPurge(plan, title, consent)}
      >
        영구 삭제 · {plan.title}
      </button>
      <p>다음 확인창에서 다시 선택해야 삭제를 시작합니다.</p>
    </section>
  );
}
