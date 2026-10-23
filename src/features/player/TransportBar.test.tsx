import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Context } from './playerContextValue';
import { PlayerEngine } from './PlayerEngine';
import { TransportBar } from './TransportBar';
afterEach(() => vi.restoreAllMocks());
function harness(preparePlayback: boolean, locked = false) {
  const engine = new PlayerEngine();
  vi.spyOn(engine, 'getSnapshot').mockReturnValue({
    ...engine.getSnapshot(),
    status: 'paused',
    durationMs: 4000,
  });
  const prepare = vi.spyOn(engine, 'prepare').mockResolvedValue();
  const countIn = vi.spyOn(engine, 'countIn').mockResolvedValue();
  render(
    <Context.Provider value={engine}>
      <TransportBar
        workspace
        preparePlayback={preparePlayback}
        locked={locked}
      />
    </Context.Provider>,
  );
  return { prepare, countIn };
}
it('연습 기본 재생과 Space는 3초 준비를 사용하고 끄기 선택도 유지한다', () => {
  const { prepare, countIn } = harness(true);
  fireEvent.click(screen.getByRole('button', { name: '▶ 재생' }));
  fireEvent.keyDown(window, { key: ' ' });
  expect(prepare).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText('카운트인'), {
    target: { value: 'off' },
  });
  fireEvent.click(screen.getByRole('button', { name: '▶ 재생' }));
  expect(countIn).toHaveBeenLastCalledWith(0);
});
it('녹음 중 재생/배속/탐색 컨트롤과 전역 단축키를 잠근다', () => {
  const { prepare, countIn } = harness(true, true);
  const play = screen.getByRole('button', { name: '녹음 중 · 재생 잠김' });
  expect(play.closest('fieldset')?.disabled).toBe(true);
  fireEvent.click(play);
  fireEvent.keyDown(window, { key: ' ' });
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  fireEvent.keyDown(window, { key: 'r' });
  expect(prepare).not.toHaveBeenCalled();
  expect(countIn).not.toHaveBeenCalled();
});
it('일반 재생은 기존 즉시 재생이며 1마디 선택은 기존 카운트인을 사용한다', () => {
  const { prepare, countIn } = harness(false);
  fireEvent.click(screen.getByRole('button', { name: '▶ 재생' }));
  expect(countIn).toHaveBeenLastCalledWith(0);
  expect(prepare).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('카운트인'), {
    target: { value: 'oneBar' },
  });
  fireEvent.click(screen.getByRole('button', { name: '▶ 재생' }));
  expect(countIn).toHaveBeenLastCalledWith(1);
});
