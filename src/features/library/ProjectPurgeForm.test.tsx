import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProjectPurgeForm } from './ProjectPurgeForm';
import type { PurgePlan } from './projectPurge';

it('제목 직접 입력과 체크가 모두 있어야 마지막 삭제 확인 명령을 전달한다', () => {
  const plan: PurgePlan = {
    projectId: '00000000-0000-4000-8000-000000000001',
    trashId: '00000000-0000-4000-8000-000000000002',
    revision: 0,
    title: '삭제 테스트',
    fingerprint: 'a'.repeat(64),
    files: 2,
    logicalBytes: 42,
    externalReferences: 1,
    purgeStarted: true,
  };
  const onPurge = vi.fn(async () => undefined);
  const view = render(
    <ProjectPurgeForm plan={plan} busy={false} onPurge={onPurge} />,
  );
  const button = screen.getByRole('button', {
    name: '영구 삭제 · 삭제 테스트',
  });
  const title = screen.getByLabelText('삭제할 프로젝트 제목 직접 입력');
  const check = screen.getByRole('checkbox');
  expect(button).toHaveProperty('disabled', true);
  fireEvent.click(check);
  expect(button).toHaveProperty('disabled', true);
  fireEvent.change(title, { target: { value: plan.title } });
  expect(button).toHaveProperty('disabled', false);
  fireEvent.click(button);
  expect(onPurge).toHaveBeenCalledWith(plan, plan.title, true);
  view.rerender(<ProjectPurgeForm plan={plan} busy={true} onPurge={onPurge} />);
  expect(button).toHaveProperty('disabled', true);
  expect(title).toHaveProperty('disabled', true);
  expect(screen.getByRole('alert').textContent).toContain('삭제 시작 기록');
});
