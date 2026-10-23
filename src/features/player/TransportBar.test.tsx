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
  return { prepare, countIn, engine };
}
it('악보에서 처리한 탐색 키는 반주를 추가로 탐색하지 않는다', () => {
  const { engine } = harness(false);
  const seek = vi.spyOn(engine, 'seek').mockImplementation(() => {});
  const region = document.createElement('section');
  document.body.append(region);
  const selected = vi.fn((event: KeyboardEvent) => event.preventDefault());
  region.addEventListener('keydown', selected);
  try {
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(selected).toHaveBeenCalledTimes(1);
    expect(seek).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(seek).toHaveBeenCalledExactlyOnceWith(4000);
  } finally {
    region.remove();
    engine.dispose();
  }
});
it('길게 누른 재생·반복과 한글 조합 입력은 재생 상태를 바꾸지 않는다', () => {
  const { engine, countIn } = harness(false);
  const loop = vi.spyOn(engine, 'setLoop').mockImplementation(() => {});
  const seek = vi.spyOn(engine, 'seek').mockImplementation(() => {});
  for (const key of [' ', 'r']) {
    fireEvent.keyDown(window, { key, repeat: true });
    fireEvent.keyDown(window, { key, isComposing: true });
  }
  fireEvent.keyDown(window, { key: 'ArrowRight', isComposing: true });
  expect(countIn).not.toHaveBeenCalled();
  expect(loop).not.toHaveBeenCalled();
  expect(seek).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'r' });
  expect(loop).toHaveBeenCalledExactlyOnceWith({ startMs: 0, endMs: 2000 });
  engine.dispose();
});
it.each(['', 'plaintext-only'])(
  'contenteditable=%s 입력의 Space는 반주를 시작하지 않는다',
  (value) => {
    const { countIn, engine } = harness(false);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', value);
    editable.innerHTML = '<span>편집 중</span>';
    document.body.append(editable);
    try {
      fireEvent.keyDown(editable.firstElementChild!, { key: ' ' });
      expect(countIn).not.toHaveBeenCalled();
    } finally {
      editable.remove();
      engine.dispose();
    }
  },
);
it('버튼 안 SVG에 초점이 있는 키는 버튼의 기본 동작에 맡긴다', () => {
  const { countIn, engine } = harness(false);
  const button = document.createElement('button');
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><path /></svg>';
  document.body.append(button);
  try {
    fireEvent.keyDown(button.firstElementChild!, { key: ' ' });
    expect(countIn).not.toHaveBeenCalled();
  } finally {
    button.remove();
    engine.dispose();
  }
});
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
