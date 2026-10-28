import {
  act,
  cleanup,
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
import { scoreExportApi } from './scoreExport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('원본 기반 편집 출력은 화면 갱신에도 유지하고 취소 정리까지 편집·재출력을 잠근다', async () => {
  const initial = scoreEditingFixture();
  expect(initial.document.renderSource).not.toBe('NORMALIZED');
  const engine = new PlayerEngine();
  vi.spyOn(engine, 'pause').mockImplementation(() => {});
  vi.spyOn(scoreExportApi, 'available').mockReturnValue(true);
  let complete: (() => void) | undefined;
  const output = vi.spyOn(scoreExportApi, 'export').mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = () => resolve({ format: 'JSON', bytes: 100 });
      }),
  );
  function Probe({ redraw }: { redraw: number }) {
    const [session, setSession] = useState<ScoreSession | null>(initial);
    const editor = useScoreEditing(session, setSession, false);
    return (
      <>
        <output aria-label="테스트 갱신">{redraw}</output>
        {session && (
          <ScoreEditor session={session} editor={editor} locked={false} />
        )}
      </>
    );
  }
  const view = (redraw: number) => (
    <Context.Provider value={engine}>
      <Probe redraw={redraw} />
    </Context.Provider>
  );
  const rendered = render(view(0));
  fireEvent.click(
    screen.getByRole('button', { name: '안내 확인 · 편집 시작' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '새 JSON으로 내보내기' }));
  const signal = output.mock.calls[0]?.[2];
  expect(signal?.aborted).toBe(false);
  rendered.rerender(view(1));
  expect(signal?.aborted).toBe(false);
  expect(output).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '출력 취소 요청' }));
  expect(signal?.aborted).toBe(true);
  expect(screen.getByText(/악보 출력 취소 정리 중/)).toBeTruthy();
  expect(screen.getByRole('button', { name: '출력 취소 요청' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(
    screen.getByRole('button', { name: '새 JSON으로 내보내기' }),
  ).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: '기타 트랙 추가' })).toHaveProperty(
    'disabled',
    true,
  );
  await act(async () => complete?.());
  expect(
    screen.getByText(/이미 저장된 파일은 유지될 수 있습니다/),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: '새 JSON으로 내보내기' }),
  ).toHaveProperty('disabled', false);
  expect(initial.document.renderSource).not.toBe('NORMALIZED');
  rendered.unmount();
  engine.dispose();
});
