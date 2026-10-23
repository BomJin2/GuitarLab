import { importer } from '@coderline/alphatab';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPlaybackLookup } from './alphaTabAdapter';
import { ScoreViewport } from './ScoreViewport';

const bounds = vi.hoisted(() => ({ y: 20 }));
const clicks = vi.hoisted(() => ({
  listeners: [] as Array<
    (beat: import('@coderline/alphatab').model.Beat) => void
  >,
  settings: [] as unknown[],
}));
vi.mock('@coderline/alphatab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coderline/alphatab')>()),
  AlphaTabApi: class {
    constructor(_host: unknown, settings: unknown) {
      clicks.settings.push(settings);
    }
    beatMouseDown = {
      on: (
        listener: (beat: import('@coderline/alphatab').model.Beat) => void,
      ) => clicks.listeners.push(listener),
    };
    renderFinished = { on: vi.fn() };
    error = { on: vi.fn() };
    boundsLookup = {
      findBeat: () => ({ onNotesX: 30, realBounds: { y: bounds.y, h: 20 } }),
    };
    renderScore = vi.fn();
    destroy = vi.fn();
  },
}));
const originalScroll = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);
const pageScroll = vi.fn();
beforeEach(() => {
  clicks.listeners = [];
  clicks.settings = [];
  bounds.y = 20;
  pageScroll.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: pageScroll,
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.classList.contains('score-cursor'))
        return new DOMRect(
          30,
          100 + bounds.y - (this.parentElement?.scrollTop ?? 0),
          3,
          20,
        );
      return new DOMRect(0, 100, 500, 300);
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
});
it('공개 박자 영역 이벤트는 최신 콜백만 호출하고 읽기 전용/해제된 렌더는 전달하지 않는다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4');
  const lookup = buildPlaybackLookup(score);
  const note =
    score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!.notes[0]!;
  const first = vi.fn();
  const next = vi.fn();
  const { rerender, unmount } = render(
    <ScoreViewport
      score={score}
      lookup={lookup}
      trackIndex={0}
      tick={0}
      onSelectNote={first}
    />,
  );
  expect(clicks.settings[0]).toMatchObject({
    player: { enablePlayer: false, enableUserInteraction: false },
  });
  expect(clicks.settings[0]).not.toHaveProperty('core.includeNoteBounds');
  act(() => clicks.listeners[0]!(note.beat));
  expect(first).toHaveBeenCalledExactlyOnceWith(note);
  rerender(
    <ScoreViewport
      score={score}
      lookup={lookup}
      trackIndex={0}
      tick={960}
      onSelectNote={next}
    />,
  );
  expect(clicks.listeners).toHaveLength(1);
  act(() => clicks.listeners[0]!(note.beat));
  expect(next).toHaveBeenCalledExactlyOnceWith(note);
  rerender(
    <ScoreViewport score={score} lookup={lookup} trackIndex={0} tick={960} />,
  );
  expect(clicks.listeners).toHaveLength(1);
  act(() => clicks.listeners[0]!(note.beat));
  const replacement = importer.ScoreLoader.loadAlphaTex('. 5.1.4');
  rerender(
    <ScoreViewport
      score={replacement}
      lookup={buildPlaybackLookup(replacement)}
      trackIndex={0}
      tick={0}
    />,
  );
  act(() => {
    clicks.listeners[0]!(note.beat);
    clicks.listeners[1]!(note.beat);
  });
  expect(next).toHaveBeenCalledTimes(1);
  unmount();
  act(() => clicks.listeners[1]!(note.beat));
  expect(next).toHaveBeenCalledTimes(1);
});
it('박자 영역의 단음만 한 번 선택하고 쉼표/여러 음은 추측하지 않는다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 r.4 (3.1 5.2).4');
  const lookup = buildPlaybackLookup(score);
  const beats = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats;
  expect(beats.slice(0, 3).map((b) => b.notes.length)).toEqual([1, 0, 2]);
  const onSelect = vi.fn();
  render(
    <ScoreViewport
      score={score}
      lookup={lookup}
      trackIndex={0}
      tick={0}
      onSelectNote={onSelect}
    />,
  );
  act(() => clicks.listeners[0]!(beats[0]!));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(beats[0]!.notes[0]);
  act(() => {
    clicks.listeners[0]!(beats[1]!);
    clicks.listeners[0]!(beats[2]!);
  });
  expect(onSelect).toHaveBeenCalledTimes(1);
});
it('악보에 초점이 있을 때만 이동 키를 처리하고 조합 키·다른 키·읽기 전용은 유지한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4');
  const lookup = buildPlaybackLookup(score);
  const onNavigate = vi.fn();
  const onSelect = vi.fn();
  const { rerender } = render(
    <ScoreViewport
      score={score}
      lookup={lookup}
      trackIndex={0}
      tick={0}
      onSelectNote={onSelect}
      onNavigateNote={onNavigate}
    />,
  );
  const region = screen.getByRole('region', { name: '실제 TAB 악보' });
  const note =
    score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!.notes[0]!;
  act(() => clicks.listeners[0]!(note.beat));
  expect(document.activeElement).toBe(region);
  expect(region.tabIndex).toBe(0);
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End'])
    expect(fireEvent.keyDown(region, { key })).toBe(false);
  expect(onNavigate.mock.calls).toEqual([
    ['previous'],
    ['next'],
    ['first'],
    ['last'],
  ]);
  expect(fireEvent.keyDown(region, { key: 'Home', ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(region, { key: 'ArrowLeft', altKey: true })).toBe(
    true,
  );
  expect(fireEvent.keyDown(region, { key: 'ArrowRight', shiftKey: true })).toBe(
    true,
  );
  expect(fireEvent.keyDown(region, { key: 'End', metaKey: true })).toBe(true);
  expect(fireEvent.keyDown(region, { key: 'ArrowDown' })).toBe(true);
  expect(onNavigate).toHaveBeenCalledTimes(4);
  rerender(
    <ScoreViewport score={score} lookup={lookup} trackIndex={0} tick={0} />,
  );
  expect(region.hasAttribute('tabindex')).toBe(false);
  expect(fireEvent.keyDown(region, { key: 'ArrowRight' })).toBe(true);
  expect(onNavigate).toHaveBeenCalledTimes(4);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalScroll)
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScroll,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});
it('커서 추적은 악보 안에서만 스크롤하고 REC 포커스와 전체 페이지 위치를 유지한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4 5.1.4 7.1.4');
  const lookup = buildPlaybackLookup(score);
  const view = (tick: number | null) => (
    <div id="main">
      <button>REC 확인</button>
      <ScoreViewport score={score} lookup={lookup} trackIndex={0} tick={tick} />
    </div>
  );
  const { rerender } = render(view(0));
  const main = document.getElementById('main');
  if (!main) throw new Error('테스트 본문 필요');
  const scroller = screen.getByRole('region', { name: '실제 TAB 악보' });
  main.scrollTop = 88;
  scroller.scrollTop = 40;
  screen.getByRole('button', { name: 'REC 확인' }).focus();
  bounds.y = 1000;
  act(() => rerender(view(960)));
  expect(pageScroll).not.toHaveBeenCalled();
  expect(scroller.scrollTop).toBe(860);
  expect(main.scrollTop).toBe(88);
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'REC 확인' }),
  );
  bounds.y = 900;
  act(() => rerender(view(1920)));
  expect(scroller.scrollTop).toBe(860);
  expect(main.scrollTop).toBe(88);
  bounds.y = 20;
  act(() => rerender(view(0)));
  expect(scroller.scrollTop).toBe(0);
  expect(pageScroll).not.toHaveBeenCalled();
  act(() => rerender(view(null)));
  expect(scroller.querySelector('.score-cursor')).toHaveProperty(
    'hidden',
    true,
  );
  expect(scroller.scrollTop).toBe(0);
  expect(main.scrollTop).toBe(88);
});
