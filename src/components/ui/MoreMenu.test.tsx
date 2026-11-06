import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MoreMenu } from './MoreMenu';

it('더보기 목록은 버튼 동작을 유지하고 Esc·바깥 클릭으로 닫힌다', () => {
  const run = vi.fn();
  render(
    <div>
      <button>바깥</button>
      <MoreMenu>
        <button onClick={run}>숨은 명령</button>
      </MoreMenu>
    </div>,
  );
  const details = document.querySelector('details') as HTMLDetailsElement;
  details.open = true;
  fireEvent.click(screen.getByRole('button', { name: '숨은 명령' }));
  expect(run).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(details.open).toBe(false);
  details.open = true;
  fireEvent.pointerDown(screen.getByRole('button', { name: '숨은 명령' }));
  expect(details.open).toBe(true);
  fireEvent.pointerDown(screen.getByRole('button', { name: '바깥' }));
  expect(details.open).toBe(false);
});
