import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PreparationCountdown } from './PreparationCountdown';

it('엔진의 남은 시간으로 큰3→2→1을 표시하고 취소를 전달한다', () => {
  const cancel = vi.fn();
  const { rerender } = render(
    <PreparationCountdown remainingMs={3000} onCancel={cancel} />,
  );
  expect(screen.getByRole('status').textContent).toBe('3');
  rerender(<PreparationCountdown remainingMs={2000} onCancel={cancel} />);
  expect(screen.getByRole('status').textContent).toBe('2');
  rerender(<PreparationCountdown remainingMs={1000} onCancel={cancel} />);
  expect(screen.getByRole('status').textContent).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: '준비 취소' }));
  expect(cancel).toHaveBeenCalledOnce();
  rerender(<PreparationCountdown remainingMs={0} onCancel={cancel} />);
  expect(screen.getByRole('status').textContent).toBe('시작');
});
it('긴 마디 준비도 실제 남은 초로 표시하고 잘못된 시간은 표시하지 않는다', () => {
  const { rerender } = render(
    <PreparationCountdown remainingMs={8000} onCancel={vi.fn()} />,
  );
  expect(screen.getByRole('status').textContent).toBe('8');
  rerender(
    <PreparationCountdown remainingMs={Number.NaN} onCancel={vi.fn()} />,
  );
  expect(screen.queryByLabelText('연주 준비')).toBeNull();
});
