import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { ScoreEditor } from './ScoreEditor';
import { useScoreEditing } from './useScoreEditing';
import type { ScoreSession } from './scoreSession';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function harness() {
  const initial = scoreEditingFixture();
  const engine = new PlayerEngine();
  vi.spyOn(engine, 'pause').mockImplementation(() => {});
  function Probe() {
    const [session, setSession] = useState<ScoreSession | null>(initial);
    const editor = useScoreEditing(session, setSession, false);
    return (
      <>
        <button>편집 밖</button>
        <output aria-label="테스트 첫 프렛">
          {session?.document.tracks[0]?.notes[0]?.fret}
        </output>
        <output aria-label="테스트 음표 수">
          {session?.document.tracks[0]?.notes.length}
        </output>
        {session && (
          <ScoreEditor session={session} editor={editor} locked={false} />
        )}
      </>
    );
  }
  const view = render(
    <Context.Provider value={engine}>
      <Probe />
    </Context.Provider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  return {
    initial,
    dispose() {
      view.unmount();
      engine.dispose();
    },
  };
}

function shortcut(key: string) {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key,
    ctrlKey: true,
  });
}

it('수정 적용으로 폼이 교체된 직후 실제 초점에서 Ctrl+Z/Y가 동작한다', () => {
  const { initial, dispose } = harness();
  const before = initial.document.tracks[0]?.notes[0]?.fret;
  fireEvent.change(screen.getByRole('spinbutton', { name: '음표 프렛' }), {
    target: { value: '4' },
  });
  const apply = screen.getByRole('button', { name: '음표 수정 적용' });
  act(() => apply.focus());
  fireEvent.click(apply);
  expect(screen.getByLabelText('테스트 첫 프렛').textContent).toBe('4');
  shortcut('z');
  expect(screen.getByLabelText('테스트 첫 프렛').textContent).toBe(
    String(before),
  );
  shortcut('y');
  expect(screen.getByLabelText('테스트 첫 프렛').textContent).toBe('4');
  dispose();
});
it('삭제로 초점 버튼이 사라져도 실제 초점에서 Ctrl+Z/Y로 음표를 복원한다', () => {
  const { initial, dispose } = harness();
  const before = initial.document.tracks[0]?.notes.length ?? 0;
  const remove = screen.getByRole('button', { name: '선택 음표 삭제' });
  act(() => remove.focus());
  fireEvent.click(remove);
  expect(screen.getByLabelText('테스트 음표 수').textContent).toBe(
    String(before - 1),
  );
  shortcut('z');
  expect(screen.getByLabelText('테스트 음표 수').textContent).toBe(
    String(before),
  );
  shortcut('y');
  expect(screen.getByLabelText('테스트 음표 수').textContent).toBe(
    String(before - 1),
  );
  dispose();
});
it('입력칸에서 폼을 제출한 뒤에도 편집 되돌리기 초점을 유지한다', () => {
  const { initial, dispose } = harness();
  const before = initial.document.tracks[0]?.notes[0]?.fret;
  const input = screen.getByRole('spinbutton', { name: '음표 프렛' });
  act(() => input.focus());
  fireEvent.change(input, { target: { value: '4' } });
  const form = input.closest('form');
  if (!form) throw new Error('음표 입력 폼 필요');
  fireEvent.submit(form);
  expect(screen.getByLabelText('테스트 첫 프렛').textContent).toBe('4');
  shortcut('z');
  expect(screen.getByLabelText('테스트 첫 프렛').textContent).toBe(
    String(before),
  );
  shortcut('y');
  expect(screen.getByLabelText('테스트 첫 프렛').textContent).toBe('4');
  dispose();
});
it('입력칸의 기본 되돌리기와 편집 영역 밖 키는 가로채지 않는다', () => {
  const { dispose } = harness();
  fireEvent.change(screen.getByRole('spinbutton', { name: '음표 프렛' }), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: '음표 수정 적용' }));
  const input = screen.getByRole('spinbutton', { name: '음표 프렛' });
  act(() => input.focus());
  const key = createEvent.keyDown(input, { key: 'z', ctrlKey: true });
  fireEvent(input, key);
  expect(key.defaultPrevented).toBe(false);
  expect(screen.getByLabelText('테스트 첫 프렛').textContent).toBe('4');
  act(() => screen.getByRole('button', { name: '편집 밖' }).focus());
  shortcut('z');
  expect(screen.getByLabelText('테스트 첫 프렛').textContent).toBe('4');
  dispose();
});
it('편집 실패 때는 입력값·오류와 연결된 버튼 초점을 유지한다', () => {
  const { initial, dispose } = harness();
  const next = initial.document.tracks[0]?.notes[1];
  if (!next) throw new Error('겹침 검사 음표 필요');
  fireEvent.change(screen.getByRole('spinbutton', { name: '음표 시작 tick' }), {
    target: { value: String(next.startTick) },
  });
  const apply = screen.getByRole('button', { name: '음표 수정 적용' });
  act(() => apply.focus());
  fireEvent.click(apply);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(document.activeElement).toBe(apply);
  expect(
    screen.getByRole('spinbutton', { name: '음표 시작 tick' }),
  ).toHaveProperty('value', String(next.startTick));
  dispose();
});
