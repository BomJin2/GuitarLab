import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import xml from '../../public/fixtures/standard.musicxml?raw';
import { App } from './App';
import { Context } from '../features/player/playerContextValue';
import { PlayerEngine } from '../features/player/PlayerEngine';

const flags = vi.hoisted(() => ({ recordingLocked: false }));
vi.mock('../features/recordings/useRecording', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../features/recordings/useRecording')
    >();
  return {
    ...original,
    useRecording(native: boolean) {
      return {
        ...original.useRecording(native),
        locked: flags.recordingLocked,
      };
    },
  };
});
vi.mock('../features/score/ScoreViewport', () => ({
  ScoreViewport: () => <div>검증용 악보 렌더</div>,
}));
afterEach(() => {
  flags.recordingLocked = false;
  vi.unstubAllGlobals();
});

it('실제 App의 녹음 잠금이 마디 반복 fieldset과 명령까지 전달된다', async () => {
  window.location.hash = '#/copy';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob([xml]) })),
  );
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:own-fixture',
    revokeObjectURL: vi.fn(),
  });
  const engine = new PlayerEngine();
  const view = () => (
    <Context.Provider value={engine}>
      <App />
    </Context.Provider>
  );
  const rendered = render(view());
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByLabelText('반복 시작 마디');
  act(() => {
    engine.load(new Blob(['own-fixture']));
    Object.defineProperty(engine.audio, 'duration', { value: 4 });
    engine.audio.dispatchEvent(new Event('loadedmetadata'));
  });
  const control = screen.getByLabelText('반복 시작 마디');
  expect(control.closest('fieldset')?.disabled).toBe(false);
  flags.recordingLocked = true;
  rendered.rerender(view());
  expect(control.closest('fieldset')?.disabled).toBe(true);
  const before = engine.getSnapshot();
  fireEvent.click(screen.getByRole('button', { name: '선택 마디 반복' }));
  expect(engine.getSnapshot()).toBe(before);
  flags.recordingLocked = false;
  rendered.rerender(view());
  expect(control.closest('fieldset')?.disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '선택 마디 반복' }));
  expect(engine.getSnapshot().loop).toEqual({ startMs: 0, endMs: 2000 });
  engine.dispose();
});
