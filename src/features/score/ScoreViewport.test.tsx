import { importer, LayoutMode, StaveProfile } from '@coderline/alphatab';
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
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { TransportBar } from '../player/TransportBar';
import { useState } from 'react';
import { useScoreEditing } from './useScoreEditing';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { renderedNoteId } from './scoreNoteSelection';

const bounds = vi.hoisted(() => ({ x: 30, y: 20 }));
const clicks = vi.hoisted(() => ({
  listeners: [] as Array<
    (beat: import('@coderline/alphatab').model.Beat) => void
  >,
  settings: [] as unknown[],
  scores: [] as import('@coderline/alphatab').model.Score[],
  deferred: false,
  events: [] as Array<{
    start?: () => void;
    finish?: () => void;
    error?: () => void;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('@coderline/alphatab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coderline/alphatab')>()),
  AlphaTabApi: class {
    events: (typeof clicks.events)[number] = { destroy: vi.fn() };
    constructor(_host: unknown, settings: unknown) {
      clicks.settings.push(settings);
      clicks.events.push(this.events);
    }
    beatMouseDown = {
      on: (
        listener: (beat: import('@coderline/alphatab').model.Beat) => void,
      ) => clicks.listeners.push(listener),
    };
    renderStarted = {
      on: (listener: () => void) => {
        this.events.start = listener;
      },
    };
    postRenderFinished = {
      on: (listener: () => void) => {
        this.events.finish = listener;
      },
    };
    error = {
      on: (listener: () => void) => {
        this.events.error = listener;
      },
    };
    boundsLookup = {
      findBeat: () => ({
        onNotesX: bounds.x,
        realBounds: { y: bounds.y, h: 20 },
      }),
    };
    renderScore = vi.fn((score: import('@coderline/alphatab').model.Score) => {
      clicks.scores.push(score);
      this.events.start?.();
      if (!clicks.deferred) this.events.finish?.();
    });
    destroy = () => this.events.destroy();
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
  clicks.scores = [];
  clicks.events = [];
  clicks.deferred = false;
  bounds.x = 30;
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
          bounds.x - (this.parentElement?.scrollLeft ?? 0),
          100 + bounds.y - (this.parentElement?.scrollTop ?? 0),
          3,
          20,
        );
      return new DOMRect(0, 100, 500, 300);
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
});
it('표시 변경만 새 렌더를 만들고 이전 완료/오류는 현재 커서와 선택에 적용하지 않는다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4');
  const lookup = buildPlaybackLookup(score);
  const onSelect = vi.fn();
  const view = (
    notation: 'tab' | 'score',
    layout: 'page' | 'horizontal',
    scale: 1 | 1.5,
  ) => (
    <ScoreViewport
      score={score}
      lookup={lookup}
      trackIndex={0}
      tick={960}
      onSelectNote={onSelect}
      display={{ notation, layout, scale }}
    />
  );
  const { rerender } = render(view('tab', 'page', 1));
  const region = screen.getByRole('region');
  const cursor = region.querySelector('.score-cursor');
  expect(cursor).toHaveProperty('hidden', false);
  expect(clicks.settings[0]).toMatchObject({
    display: {
      staveProfile: StaveProfile.Tab,
      layoutMode: LayoutMode.Page,
      scale: 1,
    },
  });
  clicks.deferred = true;
  rerender(view('score', 'horizontal', 1.5));
  expect(clicks.events[0]!.destroy).toHaveBeenCalledOnce();
  expect(clicks.settings[1]).toMatchObject({
    display: {
      staveProfile: StaveProfile.Score,
      layoutMode: LayoutMode.Horizontal,
      scale: 1.5,
    },
  });
  expect(cursor).toHaveProperty('hidden', true);
  expect(region.getAttribute('aria-busy')).toBe('true');
  const beat =
    clicks.scores[1]!.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!;
  act(() => {
    clicks.events[0]!.finish?.();
    clicks.events[0]!.error?.();
    clicks.listeners[1]!(beat);
  });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(cursor).toHaveProperty('hidden', true);
  expect(onSelect).not.toHaveBeenCalled();
  act(() => clicks.events[1]!.finish?.());
  expect(cursor).toHaveProperty('hidden', false);
  expect(region.getAttribute('aria-busy')).toBe('false');
  act(() => clicks.listeners[1]!(beat));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(
    score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!.notes[0],
  );
  rerender(view('score', 'horizontal', 1.5));
  expect(clicks.settings).toHaveLength(2);
  act(() => clicks.events[1]!.error?.());
  expect(screen.getByRole('alert').textContent).toBe(
    '악보를 표시할 수 없습니다.',
  );
  expect(cursor).toHaveProperty('hidden', true);
});
it('가로 커서 추적도 악보 안에서만 움직이고 화면과 REC 초점을 유지한다', () => {
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4');
  const lookup = buildPlaybackLookup(score);
  const view = (tick: number) => (
    <>
      <button>REC 유지</button>
      <ScoreViewport
        score={score}
        lookup={lookup}
        trackIndex={0}
        tick={tick}
        display={{ notation: 'score', layout: 'horizontal', scale: 1.25 }}
      />
    </>
  );
  const { rerender } = render(view(0));
  const region = screen.getByRole('region', { name: '실제 오선보 악보' });
  screen.getByRole('button', { name: 'REC 유지' }).focus();
  bounds.x = 1000;
  rerender(view(960));
  expect(region.scrollLeft).toBe(751.5);
  expect(region.scrollTop).toBe(0);
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'REC 유지' }),
  );
  expect(pageScroll).not.toHaveBeenCalled();
  bounds.x = 30;
  rerender(view(0));
  expect(region.scrollLeft).toBe(0);
  expect(clicks.settings).toHaveLength(1);
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
  const renderedBeat =
    clicks.scores[0]!.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!;
  act(() => clicks.listeners[0]!(renderedBeat));
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
  act(() => clicks.listeners[0]!(renderedBeat));
  expect(next).toHaveBeenCalledExactlyOnceWith(note);
  rerender(
    <ScoreViewport score={score} lookup={lookup} trackIndex={0} tick={960} />,
  );
  expect(clicks.listeners).toHaveLength(1);
  act(() => clicks.listeners[0]!(renderedBeat));
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
  const renderedBeats =
    clicks.scores[0]!.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats;
  act(() => clicks.listeners[0]!(renderedBeats[0]!));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(beats[0]!.notes[0]);
  act(() => {
    clicks.listeners[0]!(renderedBeats[1]!);
    clicks.listeners[0]!(renderedBeats[2]!);
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
  const beat =
    clicks.scores[0]!.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!;
  act(() => clicks.listeners[0]!(beat));
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
it('실제 악보의 좌우 선택과 전역 반주 탐색은 중복 실행되지 않는다', () => {
  const engine = new PlayerEngine();
  vi.spyOn(engine, 'getSnapshot').mockReturnValue({
    ...engine.getSnapshot(),
    status: 'paused',
    durationMs: 10000,
  });
  const seek = vi.spyOn(engine, 'seek').mockImplementation(() => {});
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4');
  const navigate = vi.fn();
  render(
    <Context.Provider value={engine}>
      <ScoreViewport
        score={score}
        lookup={buildPlaybackLookup(score)}
        trackIndex={0}
        tick={0}
        onNavigateNote={navigate}
      />
      <TransportBar workspace />
    </Context.Provider>,
  );
  const region = screen.getByRole('region', { name: '실제 TAB 악보' });
  fireEvent.keyDown(region, { key: 'ArrowRight' });
  fireEvent.keyDown(region, { key: 'ArrowLeft' });
  expect(navigate.mock.calls).toEqual([['next'], ['previous']]);
  expect(seek).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(seek).toHaveBeenCalledExactlyOnceWith(5000);
  engine.dispose();
});
it('TAB 클릭과 실제 화살표는 선택 음표 시간으로 한 번만 탐색하고 전역5초 탐색은 실행하지 않는다', () => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fixture'),
    revokeObjectURL: vi.fn(),
  });
  const engine = new PlayerEngine();
  engine.load(new Blob(['fixture']));
  Object.defineProperty(engine.audio, 'duration', { value: 10 });
  engine.audio.dispatchEvent(new Event('loadedmetadata'));
  const seek = vi.spyOn(engine, 'seek');
  function Workspace() {
    const [session, setSession] = useState(scoreEditingFixture);
    const editor = useScoreEditing(
      session,
      (next) => {
        setSession(
          (current) =>
            (typeof next === 'function' ? next(current) : next) ?? current,
        );
      },
      false,
    );
    return (
      <>
        <button onClick={editor.begin}>편집 시작</button>
        <ScoreViewport
          score={session.score}
          lookup={session.playbackLookup}
          trackIndex={0}
          tick={0}
          onSelectNote={
            editor.enabled
              ? (note) => {
                  const id = renderedNoteId(session, note, 0);
                  if (id) editor.selectNote(id);
                }
              : undefined
          }
          onNavigateNote={editor.enabled ? editor.moveSelection : undefined}
        />
        <TransportBar workspace />
      </>
    );
  }
  render(
    <Context.Provider value={engine}>
      <Workspace />
    </Context.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '편집 시작' }));
  const beat =
    clicks.scores[0]!.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[1]!;
  act(() => clicks.listeners[0]!(beat));
  expect(seek).toHaveBeenCalledExactlyOnceWith(500);
  const region = screen.getByRole('region', { name: '실제 TAB 악보' });
  expect(document.activeElement).toBe(region);
  fireEvent.keyDown(region, { key: 'ArrowRight' });
  expect(seek.mock.calls).toEqual([[500], [1000]]);
  expect(engine.getSnapshot()).toMatchObject({
    status: 'paused',
    audioTimeMs: 1000,
  });
  fireEvent.keyDown(region, { key: 'Home' });
  expect(seek.mock.calls).toEqual([[500], [1000], [0]]);
  engine.dispose();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
