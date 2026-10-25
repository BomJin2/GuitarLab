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

it('녹음 잠금 중 프로그램식 drop도 읽지 않고 잠금을 풀면 같은 경로로 가져온다', async () => {
  window.location.hash = '#/copy';
  const engine = new PlayerEngine();
  const view = () => (
    <Context.Provider value={engine}>
      <App />
    </Context.Provider>
  );
  flags.recordingLocked = true;
  const rendered = render(view());
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  const drop = () =>
    fireEvent.drop(screen.getByLabelText('로컬 파일 끌어놓기'), {
      dataTransfer: {
        files: [new File([xml], '자체.musicxml')],
        items: [],
        types: ['Files'],
      },
    });
  drop();
  expect(read).not.toHaveBeenCalled();
  expect(screen.getByText(/녹음·채점·파일 처리를 마친 뒤/)).toBeTruthy();
  flags.recordingLocked = false;
  rendered.rerender(view());
  drop();
  await screen.findByLabelText('악보 트랙');
  expect(read).toHaveBeenCalledOnce();
  engine.dispose();
});

it('악보 교체 확인 중 녹음 잠금이 시작되면 늦은 허가도 파일을 읽거나 적용하지 않는다', async () => {
  window.location.hash = '#/copy';
  const engine = new PlayerEngine();
  const view = () => (
    <Context.Provider value={engine}>
      <App />
    </Context.Provider>
  );
  const rendered = render(view());
  const drop = () =>
    fireEvent.drop(screen.getByLabelText('로컬 파일 끌어놓기'), {
      dataTransfer: {
        files: [new File([xml], '자체.musicxml')],
        items: [],
        types: ['Files'],
      },
    });
  drop();
  await screen.findByLabelText('악보 트랙');
  fireEvent.click(screen.getByText('안내 확인 · 편집 시작'));
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByText('음표 수정 적용'));
  let finish: (value: boolean) => void = () => {
    throw new Error('대기 초기화');
  };
  vi.stubGlobal(
    'confirm',
    vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  drop();
  flags.recordingLocked = true;
  rendered.rerender(view());
  await act(async () => finish(true));
  expect(read).not.toHaveBeenCalled();
  expect(screen.getByLabelText('음표 프렛')).toHaveProperty('value', '3');
  engine.dispose();
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
