import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  act,
  render,
  screen,
  fireEvent,
  createEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import xml from '../../public/fixtures/standard.musicxml?raw';
import dualXml from '../../public/fixtures/dual-guitar.musicxml?raw';
import jsonScore from '../../fixtures/manual-score-v1.json?raw';
import { App } from './App';
import { PlayerEngine } from '../features/player/PlayerEngine';
import { PlayerProvider } from '../features/player/PlayerContext';
import type { ComponentProps } from 'react';
import type { ScoreViewport } from '../features/score/ScoreViewport';
vi.mock('../features/score/ScoreViewport', () => ({
  ScoreViewport: ({
    score,
    tick,
    trackIndex,
    onSelectNote,
    display,
  }: ComponentProps<typeof ScoreViewport>) => (
    <section
      aria-label={
        display?.notation === 'score' ? '실제 오선보 악보' : '실제 TAB 악보'
      }
      data-display={JSON.stringify(display)}
      data-track-index={trackIndex}
      data-tick={tick}
      data-first-fret={
        score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0]?.fret
      }
    >
      렌더 위치
      {onSelectNote &&
        score.tracks[trackIndex]?.staves[0]?.bars
          .flatMap((b) =>
            b.voices.flatMap((v) => v.beats.flatMap((beat) => beat.notes)),
          )
          .map((note, i) => (
            <button key={i} onClick={() => onSelectNote(note)}>
              TAB {i + 1} 선택
            </button>
          ))}
    </section>
  ),
}));
beforeEach(() => {
  window.location.hash = '#/copy';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob([xml]) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function navigate(route: string) {
  window.location.hash = `#/${route}`;
  fireEvent(window, new HashChangeEvent('hashchange'));
}

function dropFile(file: File) {
  fireEvent.drop(screen.getByLabelText('로컬 파일 끌어놓기'), {
    dataTransfer: { files: [file], items: [], types: ['Files'] },
  });
}
it('끌어놓은 MusicXML·JSON은 같은 가져오기 경로로 열고 WAV는 자동 재생하지 않는다', async () => {
  const OriginalURL = URL;
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static createObjectURL = vi.fn(() => 'blob:drop-fixture');
      static revokeObjectURL = vi.fn();
    },
  );
  const audio = vi.spyOn(PlayerEngine.prototype, 'load');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  dropFile(new File([xml], '자체.musicxml'));
  await screen.findByLabelText('악보 트랙');
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('0');
  dropFile(new File([jsonScore], '자체.JSON'));
  await waitFor(() =>
    expect(
      screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
    ).toBe('3'),
  );
  const file = new File(['RIFF....WAVE'], '자체.wav');
  dropFile(file);
  await waitFor(() => expect(audio).toHaveBeenCalledWith(file));
  expect(play).not.toHaveBeenCalled();
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
});

it('여러 파일·폴더·URL·빈/초과/다른 형식 drop은 읽기·교체 전에 거부한다', () => {
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  const file = new File([xml], '자체.musicxml');
  const large = new File([xml], '초과.musicxml');
  Object.defineProperty(large, 'size', { value: 8 * 1024 * 1024 + 1 });
  const zone = screen.getByLabelText('로컬 파일 끌어놓기');
  for (const transfer of [
    { files: [file, file], items: [] },
    {
      files: [file],
      items: [
        { kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true }) },
      ],
    },
    { files: [], items: [{ kind: 'string' }] },
    { files: [new File([], '빈.musicxml')], items: [] },
    { files: [large], items: [] },
    { files: [new File(['keep'], '다른.exe')], items: [] },
  ]) {
    const event = createEvent.drop(zone, {
      cancelable: true,
      dataTransfer: { ...transfer, types: ['Files'] },
    });
    fireEvent(zone, event);
    expect(event.defaultPrevented).toBe(true);
  }
  expect(read).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('악보 트랙')).toBeNull();
  expect(window.location.hash).toBe('#/copy');
});

it('drop 악보 교체는 미저장 확인 취소/오류·중복/취소 뒤 늦은 허가에서도 편집을 유지한다', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const confirm = vi.fn().mockResolvedValue(false);
  vi.stubGlobal('confirm', confirm);
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  dropFile(new File([xml], '자체.musicxml'));
  await screen.findByLabelText('악보 트랙');
  fireEvent.click(screen.getByText('안내 확인 · 편집 시작'));
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByText('음표 수정 적용'));
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  const replacement = new File([dualXml], '교체.musicxml');
  dropFile(replacement);
  await screen.findByText(/기존 악보와 편집을 유지했습니다/);
  expect(read).not.toHaveBeenCalled();
  confirm.mockRejectedValueOnce(new Error('private/path'));
  dropFile(replacement);
  await screen.findByText(/악보 교체 확인을 열지 못했습니다/);
  expect(read).not.toHaveBeenCalled();
  let finish: (value: boolean) => void = () => {
    throw new Error('대기 초기화');
  };
  confirm.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  confirm.mockClear();
  dropFile(replacement);
  dropFile(replacement);
  expect(confirm).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  await act(async () => finish(true));
  expect(read).not.toHaveBeenCalled();
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
});

it('다른 화면에 놓은 파일은 앱 문서로 이동하지 않고 다른 작업을 시작하지 않는다', () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  navigate('library');
  const heading = screen.getByRole('main');
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  const event = createEvent.drop(heading, {
    cancelable: true,
    dataTransfer: {
      files: [new File([xml], '자체.musicxml')],
      types: ['Files'],
    },
  });
  fireEvent(heading, event);
  expect(event.defaultPrevented).toBe(true);
  expect(window.location.hash).toBe('#/library');
  expect(read).not.toHaveBeenCalled();
});
it('트랙 위아래 이동은 선택/음표를 유지하고 Undo/Redo·독립 원본 비교 순서를 연결한다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.change(screen.getByLabelText('악보 선택'), {
    target: { files: [new File([dualXml], '두 기타.musicxml')] },
  });
  const selector = await screen.findByLabelText('악보 트랙');
  if (!(selector instanceof HTMLSelectElement))
    throw new Error('악보 선택기 필요');
  const ids = [...selector.options].map((option) => option.value);
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  const up = () => screen.getByRole('button', { name: '트랙 위로 이동' });
  const down = () => screen.getByRole('button', { name: '트랙 아래로 이동' });
  expect(up()).toHaveProperty('disabled', true);
  const fret = screen.getByLabelText('음표 프렛').getAttribute('value');
  fireEvent.click(down());
  expect([...selector.options].map((option) => option.value)).toEqual([
    ids[1],
    ids[0],
  ]);
  expect(selector.value).toBe(ids[0]);
  expect(screen.getByLabelText('음표 프렛').getAttribute('value')).toBe(fret);
  expect(down()).toHaveProperty('disabled', true);
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-track-index'),
  ).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect([...selector.options].map((option) => option.value)).toEqual(ids);
  expect(selector.value).toBe(ids[0]);
  fireEvent.click(screen.getByRole('button', { name: '다시 실행' }));
  expect([...selector.options].map((option) => option.value)).toEqual([
    ids[1],
    ids[0],
  ]);
  fireEvent.click(screen.getByRole('button', { name: '원본 악보 비교 보기' }));
  expect(
    screen.getByLabelText('원본 악보 트랙').querySelectorAll('option')[0]
      ?.textContent,
  ).toContain('Guitar');
  expect(
    screen
      .getByLabelText('읽기 전용 원본 비교')
      .querySelector('[data-track-index]')
      ?.getAttribute('data-track-index'),
  ).toBe('0');
  fireEvent.click(up());
  expect([...selector.options].map((option) => option.value)).toEqual(ids);
  expect(selector.value).toBe(ids[0]);
});

it('추가한 트랙을 삭제하고 되돌리면 목록뿐 아니라 화면 선택도 복구된 트랙으로 돌아간다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  const selector = await screen.findByLabelText('악보 트랙');
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '기타 트랙 추가' }));
  if (!(selector instanceof HTMLSelectElement))
    throw new Error('악보 선택기 필요');
  const addedId = selector.value;
  fireEvent.click(
    screen.getByRole('checkbox', { name: /편집본에서 제거합니다/ }),
  );
  fireEvent.click(screen.getByRole('button', { name: '선택 악보 트랙 삭제' }));
  expect([...selector.options].some((option) => option.value === addedId)).toBe(
    false,
  );
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect(selector.options).toHaveLength(2);
  expect(selector.value).toBe(addedId);
  expect(screen.getByRole('button', { name: '새 음표 적용' })).toBeTruthy();
});
it('트랙 삭제 확인·선택 복귀·Undo/Redo와 독립 원본 선택은 서로의 문서를 바꾸지 않는다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.change(screen.getByLabelText('악보 선택'), {
    target: { files: [new File([dualXml], '두 기타.musicxml')] },
  });
  const selector = await screen.findByLabelText('악보 트랙');
  if (!(selector instanceof HTMLSelectElement))
    throw new Error('악보 선택기 필요');
  const ids = [...selector.options].map((option) => option.value);
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  const remove = () =>
    screen.getByRole('button', { name: '선택 악보 트랙 삭제' });
  const confirm = () =>
    screen.getByRole('checkbox', { name: /편집본에서 제거합니다/ });
  expect(remove()).toHaveProperty('disabled', true);
  fireEvent.click(confirm());
  fireEvent.click(screen.getByRole('button', { name: '오선보 보기' }));
  expect(confirm()).toHaveProperty('checked', true);
  fireEvent.change(screen.getByLabelText('악보 트랙 이름'), {
    target: { value: '삭제 확인 트랙' },
  });
  fireEvent.click(screen.getByRole('button', { name: '트랙 이름 적용' }));
  expect(confirm()).toHaveProperty('checked', false);
  fireEvent.click(confirm());
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '2' },
  });
  fireEvent.click(screen.getByRole('button', { name: '음표 수정 적용' }));
  expect(confirm()).toHaveProperty('checked', false);
  fireEvent.click(confirm());
  fireEvent.change(selector, { target: { value: ids[1] } });
  fireEvent.change(selector, { target: { value: ids[0] } });
  expect(confirm()).toHaveProperty('checked', false);
  fireEvent.click(confirm());
  fireEvent.click(remove());
  expect([...selector.options].map((option) => option.value)).toEqual([ids[1]]);
  expect(selector.value).toBe(ids[1]);
  expect(remove().closest('fieldset')?.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect([...selector.options].map((option) => option.value)).toEqual(ids);
  fireEvent.click(screen.getByRole('button', { name: '다시 실행' }));
  expect([...selector.options].map((option) => option.value)).toEqual([ids[1]]);
  fireEvent.click(screen.getByRole('button', { name: '원본 악보 비교 보기' }));
  const original = screen.getByLabelText('원본 악보 트랙');
  expect(original.querySelectorAll('option')).toHaveLength(2);
  fireEvent.change(original, { target: { value: '1' } });
  expect(
    screen
      .getByLabelText('읽기 전용 원본 비교')
      .querySelector('[data-track-index]')
      ?.getAttribute('data-track-index'),
  ).toBe('1');
  expect(selector.value).toBe(ids[1]);
});
it('표시 선택은 편집/커서/epoch와 history를 보존하고 화면 왕복에도 유지한다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByLabelText('악보 트랙');
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'TAB 2 선택' }));
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: '음표 수정 적용' }));
  const epoch = screen.getByText(/재생 epoch/).textContent;
  fireEvent.click(screen.getByRole('button', { name: '오선보 보기' }));
  fireEvent.change(screen.getByLabelText('악보 배치'), {
    target: { value: 'horizontal' },
  });
  fireEvent.change(screen.getByLabelText('악보 확대'), {
    target: { value: '1.5' },
  });
  expect(
    screen.getByLabelText('실제 오선보 악보').getAttribute('data-display'),
  ).toBe(
    JSON.stringify({ notation: 'score', layout: 'horizontal', scale: 1.5 }),
  );
  expect(
    screen.getByLabelText('실제 오선보 악보').getAttribute('data-tick'),
  ).toBe('960');
  expect(screen.getByLabelText('음표 프렛')).toHaveProperty('value', '4');
  expect(screen.getByText(/재생 epoch/).textContent).toBe(epoch);
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect(screen.getByLabelText('음표 프렛')).toHaveProperty('value', '3');
  navigate('library');
  navigate('copy');
  expect(screen.getByRole('button', { name: 'TAB 보기' })).toBeTruthy();
  expect(screen.getByLabelText('악보 배치')).toHaveProperty(
    'value',
    'horizontal',
  );
  expect(screen.getByLabelText('악보 확대')).toHaveProperty('value', '1.5');
  fireEvent.change(screen.getByLabelText('악보 확대'), {
    target: { value: '99' },
  });
  expect(screen.getByLabelText('악보 확대')).toHaveProperty('value', '1.5');
  navigate('practice');
  expect(screen.getByRole('button', { name: 'TAB 보기' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'TAB 보기' }));
  expect(screen.getByRole('button', { name: '오선보 보기' })).toBeTruthy();
  expect(screen.getByLabelText('실제 TAB 악보')).toBeTruthy();
});
it('TAB 클릭·이전/다음·목록 선택과 커서를 연결하고 선택한 음표만 수정한다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByLabelText('악보 트랙');
  expect(screen.queryByRole('button', { name: 'TAB 2 선택' })).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'TAB 2 선택' }));
  const selector = screen.getByLabelText('편집할 음표');
  if (!(selector instanceof HTMLSelectElement))
    throw new Error('음표 목록 필요');
  expect(selector.selectedIndex).toBe(1);
  expect(screen.getByLabelText('음표 프렛')).toHaveProperty('value', '3');
  expect(screen.getByLabelText('실제 TAB 악보').getAttribute('data-tick')).toBe(
    '960',
  );
  fireEvent.click(screen.getByRole('button', { name: '다음 음표' }));
  expect(selector.selectedIndex).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: '이전 음표' }));
  expect(selector.selectedIndex).toBe(1);
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: '음표 수정 적용' }));
  expect(selector.selectedIndex).toBe(1);
  expect(screen.getByLabelText('음표 프렛')).toHaveProperty('value', '4');
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('0');
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect(selector.selectedIndex).toBe(1);
  expect(screen.getByLabelText('음표 프렛')).toHaveProperty('value', '3');
  fireEvent.change(selector, { target: { value: 'new' } });
  expect(screen.getByRole('button', { name: '새 음표 적용' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '이전 음표' })).toHaveProperty(
    'disabled',
    true,
  );
  navigate('practice');
  expect(screen.queryByRole('button', { name: 'TAB 2 선택' })).toBeNull();
  navigate('copy');
  expect(screen.getByRole('button', { name: '새 음표 적용' })).toBeTruthy();
});
it('압축 해제 한도 오류는 이유를 표시하고 기존 미저장 프렛을 보존한다', async () => {
  vi.stubGlobal('confirm', vi.fn().mockResolvedValue(true));
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByLabelText('악보 트랙');
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByRole('button', { name: '음표 수정 적용' }));
  const archive = new Uint8Array([66, 67, 70, 90, 0, 0, 0, 0]);
  new DataView(archive.buffer).setUint32(4, 32 * 1024 * 1024 + 1, true);
  fireEvent.change(screen.getByLabelText('악보 선택'), {
    target: { files: [new File([archive], '과다.gpx')] },
  });
  await screen.findByText(/압축 악보는 해제 후32MiB/);
  expect(screen.getByLabelText('음표 프렛')).toHaveProperty('value', '3');
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
});
it('이름 적용·오류·Undo/Redo를 선택기와 연결하고 미적용 폼은 악보를 바꾸지 않는다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  const selector = await screen.findByLabelText('악보 트랙');
  if (!(selector instanceof HTMLSelectElement))
    throw new Error('트랙 선택 필요');
  const selectedId = selector.value;
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  const initial = screen.getByLabelText('악보 트랙 이름').getAttribute('value');
  fireEvent.change(screen.getByLabelText('악보 트랙 이름'), {
    target: { value: '내 리드' },
  });
  expect(screen.queryByRole('option', { name: /내 리드/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '트랙 이름 적용' }));
  expect(screen.getByRole('option', { name: /내 리드/ })).toBeTruthy();
  expect(selector.value).toBe(selectedId);
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect(screen.getByLabelText('악보 트랙 이름')).toHaveProperty(
    'value',
    initial,
  );
  fireEvent.click(screen.getByRole('button', { name: '다시 실행' }));
  expect(screen.getByLabelText('악보 트랙 이름')).toHaveProperty(
    'value',
    '내 리드',
  );
  fireEvent.change(screen.getByLabelText('악보 트랙 이름'), {
    target: { value: '  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: '트랙 이름 적용' }));
  expect(screen.getByRole('alert').textContent).toContain('1~200');
  expect(screen.getByRole('option', { name: /내 리드/ })).toBeTruthy();
});
it('추가한 기타에만 음표를 쓰고 독립 원본 비교·Undo 후 안전한 선택·모드 복귀를 연결한다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  const selector = await screen.findByLabelText('악보 트랙');
  if (!(selector instanceof HTMLSelectElement))
    throw new Error('트랙 선택 필요');
  const firstId = selector.value;
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '기타 트랙 추가' }));
  const addedId = selector.value;
  expect(addedId).not.toBe(firstId);
  expect(screen.getByRole('button', { name: '새 음표 적용' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '원본 악보 비교 보기' }));
  expect(
    screen.getByLabelText('원본 악보 트랙').querySelectorAll('option'),
  ).toHaveLength(1);
  expect(selector.value).toBe(addedId);
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByRole('button', { name: '새 음표 적용' }));
  navigate('practice');
  expect(screen.getByText(/목표 운지: MIDI 67/)).toBeTruthy();
  navigate('copy');
  expect(screen.getByLabelText('악보 트랙')).toHaveProperty('value', addedId);
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect(screen.getByLabelText('악보 트랙')).toHaveProperty('value', firstId);
  expect(
    screen.getByLabelText('원본 악보 트랙').querySelectorAll('option'),
  ).toHaveLength(1);
  expect(screen.getByLabelText('음표 프렛').getAttribute('value')).toBe('0');
});
it('JSON 파일 선택·편집·Undo와 읽기 전용 원본 비교를 연결하고 교체 취소 때 유지한다', async () => {
  vi.stubGlobal('confirm', vi.fn().mockResolvedValue(false));
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  const input = screen.getByLabelText('악보 선택');
  expect(input.getAttribute('accept')).toContain('.json');
  fireEvent.change(input, {
    target: { files: [new File([jsonScore], '직접 작성.json')] },
  });
  await screen.findByLabelText('악보 트랙');
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: '음표 수정 적용' }));
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('4');
  fireEvent.click(screen.getByRole('button', { name: '원본 악보 비교 보기' }));
  const scores = screen.getAllByLabelText('실제 TAB 악보');
  expect(
    scores.map((score) => score.getAttribute('data-first-fret')).sort(),
  ).toEqual(['3', '4']);
  fireEvent.click(screen.getByRole('button', { name: '빈 악보 만들기' }));
  await screen.findByText(/기존 악보와 편집을 유지했습니다/);
  expect(screen.getByLabelText('음표 프렛').getAttribute('value')).toBe('4');
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect(screen.getByLabelText('음표 프렛').getAttribute('value')).toBe('3');
  expect(fetch).not.toHaveBeenCalled();
});
it('빈 악보 작성·Undo/Redo를 연결하고 비동기 교체 취소 때 음표를 유지한다', async () => {
  vi.stubGlobal('confirm', vi.fn().mockResolvedValue(false));
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '빈 악보 만들기' }));
  await screen.findByLabelText('악보 트랙');
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  expect(screen.getByRole('button', { name: '새 음표 적용' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByRole('button', { name: '새 음표 적용' }));
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect(screen.getByRole('button', { name: '새 음표 적용' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '다시 실행' }));
  fireEvent.click(screen.getByRole('button', { name: '빈 악보 만들기' }));
  await screen.findByText(/기존 악보와 편집을 유지했습니다/);
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
  expect(fetch).not.toHaveBeenCalled();
});
it('카피에서 수정/Undo/Redo한 음정은 연습 목표와 모드 복귀에도 유지된다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByLabelText('악보 트랙');
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByRole('button', { name: '음표 수정 적용' }));
  expect(screen.getByLabelText('음표 프렛').getAttribute('value')).toBe('3');
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
  navigate('practice');
  expect(screen.getByText(/목표 운지: MIDI 67/)).toBeTruthy();
  expect(screen.getByText('● 67').className).toBe('target-fret');
  navigate('library');
  navigate('copy');
  fireEvent.keyDown(screen.getByLabelText('음표 프렛'), {
    key: 'z',
    ctrlKey: true,
  });
  expect(screen.getByText(/목표 운지: MIDI 67/)).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: '되돌리기' }), {
    key: 'z',
    ctrlKey: true,
  });
  expect(screen.getByLabelText('음표 프렛').getAttribute('value')).toBe('0');
  expect(screen.getByText('● 64').className).toBe('target-fret');
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('0');
  fireEvent.keyDown(screen.getByRole('button', { name: '다시 실행' }), {
    key: 'z',
    ctrlKey: true,
    shiftKey: true,
  });
  expect(screen.getByLabelText('음표 프렛').getAttribute('value')).toBe('3');
});
it('구조 편집은 싱크 재설정 확인 후 마디를 추가하고 튜닝/Undo와 비교를 분리한다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByLabelText('악보 트랙');
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  const add = screen.getByRole('button', { name: '끝에 빈 마디 추가' });
  expect(add.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /마디\/템포 변경 시/ }));
  fireEvent.click(add);
  expect(
    screen.getByLabelText('편집할 마디').querySelectorAll('option'),
  ).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('음표 시작 tick'), {
    target: { value: '7680' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: '입력한 위치에 음표 복제' }),
  );
  expect(
    screen.getByLabelText('편집할 음표').querySelectorAll('option'),
  ).toHaveLength(10);
  fireEvent.change(screen.getByLabelText('튜닝 1번 줄 MIDI'), {
    target: { value: '62' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: '프렛을 유지하고 튜닝 적용' }),
  );
  expect(screen.getByText(/목표 운지: MIDI 62/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
  expect(screen.getByText(/목표 운지: MIDI 64/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '원본 악보 비교 보기' }));
  expect(screen.getByLabelText('읽기 전용 원본 비교')).toBeTruthy();
  expect(
    screen.getByLabelText('편집할 마디').querySelectorAll('option'),
  ).toHaveLength(3);
});
it('악보와 적용한 앵커는 모드·라이브러리·설정 이동 후에도 유지된다', async () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await waitFor(() => expect(screen.getByLabelText('악보 트랙')).toBeTruthy());
  const inputs = screen.getAllByLabelText('음원 ms');
  if (!inputs[0] || !inputs[1]) throw new Error('앵커 입력 누락');
  fireEvent.change(inputs[0], { target: { value: '5000' } });
  fireEvent.change(inputs[1], { target: { value: '9000' } });
  fireEvent.click(screen.getByRole('button', { name: '싱크 적용' }));
  navigate('practice');
  expect(screen.getByRole('heading', { name: '연습 작업 공간' })).toBeTruthy();
  expect(screen.getAllByLabelText('음원 ms')[0]?.getAttribute('value')).toBe(
    '5000',
  );
  expect(screen.getByLabelText('악보 트랙')).toBeTruthy();
  navigate('settings');
  navigate('library');
  navigate('copy');
  expect(screen.getByLabelText('악보 트랙')).toBeTruthy();
  expect(screen.getAllByLabelText('음원 ms')[0]?.getAttribute('value')).toBe(
    '5000',
  );
});
it('진행 중 fixture를 취소하면 이후 완료 결과가 적용되지 않는다', async () => {
  let resolve: (value: unknown) => void = () => undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((ok) => {
          resolve = ok;
        }),
    ),
  );
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  resolve({ ok: true, blob: async () => new Blob([xml]) });
  await waitFor(() =>
    expect(screen.getByText('파일 불러오기를 취소했습니다.')).toBeTruthy(),
  );
  expect(screen.queryByLabelText('악보 트랙')).toBeNull();
});
it('손상 악보는 실패 상태를 표시하고 다음 정상 import는 성공한다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob(['broken']) })),
  );
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('악보 트랙')).toBeNull();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob([xml]) })),
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByLabelText('악보 트랙');
  expect(screen.queryByRole('alert')).toBeNull();
});
it('내장 파일 읽기 차단은 악보 파싱 오류와 구분하고 개인 오류 원문을 노출하지 않는다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('private/local/path')),
  );
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  const error = await screen.findByRole('alert');
  expect(error.textContent).toContain('LOCAL_FIXTURE_READ_FAILED');
  expect(error.textContent).not.toContain('private');
  expect(screen.queryByLabelText('악보 트랙')).toBeNull();
});

it('직접 악보 교체 취소·파일 오류는 실제 편집을 유지하고 동의한 정상 교체만 적용한다', async () => {
  const confirm = vi.fn().mockResolvedValue(false);
  vi.stubGlobal('confirm', confirm);
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByLabelText('악보 트랙');
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByRole('button', { name: '음표 수정 적용' }));
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  fireEvent.change(screen.getByLabelText('악보 선택'), {
    target: { files: [new File([xml], '다른.musicxml')] },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
  await screen.findByText(/기존 악보와 편집을 유지/);
  confirm.mockResolvedValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob(['broken']) })),
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByRole('alert');
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob([xml]) })),
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await waitFor(() =>
    expect(
      screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
    ).toBe('0'),
  );
});

it('확인 대기·중복 요청·거절·취소와 화면 이탈 뒤 늦은 승인은 파일을 읽거나 편집을 버리지 않는다', async () => {
  const confirm = vi.fn<() => Promise<boolean>>();
  vi.stubGlobal('confirm', confirm);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByLabelText('악보 트랙');
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.change(screen.getByLabelText('음표 프렛'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByRole('button', { name: '음표 수정 적용' }));
  let finish: (value: boolean) => void = () => {
    throw new Error('대기 초기화');
  };
  confirm.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => finish(false));
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
  confirm.mockRejectedValueOnce(new Error('private/path'));
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  await screen.findByText(/악보 교체 확인을 열지 못했습니다/);
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  await act(async () => finish(true));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '자체 악보 불러오기' }));
  navigate('library');
  await act(async () => finish(true));
  navigate('copy');
  expect(
    screen.getByLabelText('실제 TAB 악보').getAttribute('data-first-fret'),
  ).toBe('3');
  expect(fetch).toHaveBeenCalledTimes(1);
});
