import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import xml from '../../../public/fixtures/standard.musicxml?raw';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { TransportBar } from '../player/TransportBar';
import {
  buildPlaybackLookup,
  importScore,
  normalizeScore,
} from './alphaTabAdapter';
import { ScoreLoopPanel } from './ScoreLoopPanel';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const lookup = buildPlaybackLookup(importScore(new TextEncoder().encode(xml)));
const anchors = normalizeScore(
  importScore(new TextEncoder().encode(xml)),
).syncAnchors;

function harness(locked = false) {
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:own-fixture',
    revokeObjectURL: vi.fn(),
  });
  const engine = new PlayerEngine();
  engine.load(new Blob(['own-fixture']));
  Object.defineProperty(engine.audio, 'duration', {
    value: 4,
    configurable: true,
  });
  engine.audio.dispatchEvent(new Event('loadedmetadata'));
  const play = vi.spyOn(engine, 'play').mockResolvedValue();
  const view = (busy: boolean) => (
    <Context.Provider value={engine}>
      <ScoreLoopPanel lookup={lookup} anchors={anchors} locked={busy} />
      <TransportBar workspace />
    </Context.Provider>
  );
  const rendered = render(view(locked));
  return {
    engine,
    play,
    rerender: (busy: boolean) => rendered.rerender(view(busy)),
  };
}

it('마디 선택은 자동 재생 없이 새 epoch로 이동하며 하단 반복과 같은 상태를 쓴다', () => {
  const { engine, play } = harness();
  const epoch = engine.getSnapshot().playbackEpoch;
  fireEvent.change(screen.getByLabelText('반복 시작 마디'), {
    target: { value: '1' },
  });
  fireEvent.change(screen.getByLabelText('반복 끝 마디'), {
    target: { value: '1' },
  });
  fireEvent.click(screen.getByRole('button', { name: '선택 마디 반복' }));
  expect(engine.getSnapshot().loop).toEqual({ startMs: 2000, endMs: 4000 });
  expect(engine.getSnapshot().audioTimeMs).toBe(2000);
  expect(engine.getSnapshot().playbackEpoch).toBeGreaterThan(epoch);
  expect(engine.getSnapshot().status).toBe('paused');
  expect(play).not.toHaveBeenCalled();
  expect(screen.getByText('적용한 반복: 2000~4000 ms')).toBeTruthy();
  expect(screen.getByLabelText('A ms')).toHaveProperty('value', '2000');
  expect(screen.getByLabelText('B ms')).toHaveProperty('value', '4000');
  fireEvent.click(screen.getByRole('button', { name: '반복 끄기' }));
  expect(screen.getByRole('button', { name: '반복 해제' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: '반복 켜기' }));
  expect(engine.getSnapshot().loop).toEqual({ startMs: 2000, endMs: 4000 });
  fireEvent.click(screen.getByRole('button', { name: '선택 마디 반복' }));
  fireEvent.click(screen.getByRole('button', { name: '반복 해제' }));
  expect(engine.getSnapshot().loop).toBeNull();
  engine.dispose();
});

it('역전/음원 밖 선택은 기존 반복·위치·epoch를 보존하고 녹음/로딩 중 잠근다', () => {
  const { engine, rerender } = harness();
  act(() => {
    engine.setLoop({ startMs: 0, endMs: 1000 });
    engine.seek(500);
  });
  const before = engine.getSnapshot();
  fireEvent.change(screen.getByLabelText('반복 시작 마디'), {
    target: { value: '1' },
  });
  fireEvent.click(screen.getByRole('button', { name: '선택 마디 반복' }));
  expect(screen.getByRole('alert').textContent).toContain('시작·끝 마디');
  expect(engine.getSnapshot()).toBe(before);
  fireEvent.change(screen.getByLabelText('반복 끝 마디'), {
    target: { value: '1' },
  });
  rerender(true);
  fireEvent.click(screen.getByRole('button', { name: '선택 마디 반복' }));
  expect(
    screen.getByLabelText('반복 시작 마디').closest('fieldset')?.disabled,
  ).toBe(true);
  expect(engine.getSnapshot()).toBe(before);
  rerender(false);
  Object.defineProperty(engine.audio, 'duration', {
    value: 3,
    configurable: true,
  });
  act(() => engine.audio.dispatchEvent(new Event('loadedmetadata')));
  const shortAudio = engine.getSnapshot();
  fireEvent.click(screen.getByRole('button', { name: '선택 마디 반복' }));
  expect(engine.getSnapshot()).toBe(shortAudio);
  act(() => engine.load(new Blob(['next-fixture'])));
  expect(
    screen.getByLabelText('반복 끝 마디').closest('fieldset')?.disabled,
  ).toBe(true);
  engine.dispose();
});
