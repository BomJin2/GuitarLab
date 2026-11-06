import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { MenuBar } from './MenuBar';

vi.mock('../features/player/TransportBar', () => ({
  TransportBar: () => null,
}));
afterEach(cleanup);

it('메뉴는 누를 때만 펼치고 기존 화면으로 이동하며 준비 중 항목은 비활성이다', () => {
  const onHelp = vi.fn();
  render(<MenuBar onHelp={onHelp} />);
  expect(screen.queryByRole('list', { name: '파일 메뉴' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '파일' }));
  expect(screen.getByRole('button', { name: '파일' })).toHaveProperty(
    'ariaExpanded',
    'true',
  );
  expect(
    screen
      .getByRole('link', { name: '새 프로젝트 · 프로젝트 열기' })
      .getAttribute('href'),
  ).toBe('#/library');
  fireEvent.click(screen.getByRole('button', { name: '보기' }));
  expect(screen.queryByRole('list', { name: '파일 메뉴' })).toBeNull();
  expect(screen.getByText('DAW / 편곡').getAttribute('aria-disabled')).toBe(
    'true',
  );
  fireEvent.keyDown(screen.getByRole('button', { name: '보기' }), {
    key: 'Escape',
  });
  expect(screen.queryByRole('list', { name: '보기 메뉴' })).toBeNull();
  // 바깥 클릭(전파를 막는 요소 포함)과 포커스가 메뉴 밖일 때의 Esc로도 닫힙니다.
  const outside = document.createElement('div');
  outside.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.body.append(outside);
  fireEvent.click(screen.getByRole('button', { name: '편집' }));
  fireEvent.pointerDown(outside);
  expect(screen.queryByRole('list', { name: '편집 메뉴' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '편집' }));
  fireEvent.keyDown(outside, { key: 'Escape' });
  expect(screen.queryByRole('list', { name: '편집 메뉴' })).toBeNull();
  outside.remove();
  // 창 밖(바탕화면)을 누르면 창이 포커스를 잃으며 닫힙니다.
  fireEvent.click(screen.getByRole('button', { name: '편집' }));
  fireEvent.blur(window);
  expect(screen.queryByRole('list', { name: '편집 메뉴' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '도움말' }));
  fireEvent.click(screen.getByRole('button', { name: /단축키 안내/ }));
  expect(onHelp).toHaveBeenCalledOnce();
  expect(screen.queryByRole('list', { name: '도움말 메뉴' })).toBeNull();
});

it('편집 메뉴의 실행 취소·다시 실행은 할 수 있을 때만 누를 수 있고, 트랙·마디 편집은 카피로 이동한다', () => {
  const undo = vi.fn();
  const { rerender } = render(<MenuBar edit={{ undo }} />);
  fireEvent.click(screen.getByRole('button', { name: '편집' }));
  fireEvent.click(screen.getByRole('button', { name: /실행 취소/ }));
  expect(undo).toHaveBeenCalledOnce();
  expect(screen.queryByRole('list', { name: '편집 메뉴' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '편집' }));
  // 다시 실행할 것이 없으면 버튼이 아니라 비활성 항목입니다.
  expect(screen.queryByRole('button', { name: /다시 실행/ })).toBeNull();
  expect(
    screen.getByText('다시 실행').closest('[aria-disabled]')?.textContent,
  ).toContain('Ctrl+Y');
  rerender(<MenuBar />);
  expect(screen.queryByRole('button', { name: /실행 취소/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '트랙' }));
  expect(
    screen
      .getByRole('link', { name: '트랙 추가 · 삭제(카피)' })
      .getAttribute('href'),
  ).toBe('#/copy');
  fireEvent.click(screen.getByRole('button', { name: '마디' }));
  expect(
    screen
      .getByRole('link', { name: '마디 추가 · 삭제(카피)' })
      .getAttribute('href'),
  ).toBe('#/copy');
});

it('녹음 중에는 메뉴·탭으로 화면을 바꾸지 않고 REC 띠를 보여 준다', () => {
  window.location.hash = '#/copy';
  render(
    <AppShell route="copy" inputState="STOPPED" recordingLocked>
      <p>본문</p>
    </AppShell>,
  );
  expect(screen.getByText(/다른 화면으로 이동할 수 없습니다/)).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: '라이브러리' }));
  fireEvent.click(screen.getByRole('button', { name: '도구' }));
  fireEvent.click(screen.getByRole('link', { name: '반주 찾기' }));
  expect(window.location.hash).toBe('#/copy');
  expect(
    screen.getByRole('link', { name: '카피' }).getAttribute('aria-current'),
  ).toBe('page');
  expect(screen.getByRole('button', { name: /DAW \/ 편곡/ })).toHaveProperty(
    'disabled',
    true,
  );
});

it('보기 전환은 작업 공간에서만 토글·메뉴로 바꾸고 다른 화면에서는 비활성이다', () => {
  const onViewChange = vi.fn();
  const { rerender } = render(
    <AppShell
      route="practice"
      inputState="STOPPED"
      view="score"
      onViewChange={onViewChange}
    >
      <p>본문</p>
    </AppShell>,
  );
  expect(
    screen
      .getByRole('button', { name: '악보 / 편집' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'DAW / 편곡' }));
  expect(onViewChange).toHaveBeenLastCalledWith('daw');
  fireEvent.click(screen.getByRole('button', { name: '보기' }));
  fireEvent.click(
    screen.getAllByRole('button', { name: '악보 / 편집' })[1] as HTMLElement,
  );
  expect(onViewChange).toHaveBeenLastCalledWith('score');
  rerender(
    <AppShell
      route="library"
      inputState="STOPPED"
      view="daw"
      onViewChange={onViewChange}
    >
      <p>본문</p>
    </AppShell>,
  );
  expect(screen.getByRole('button', { name: 'DAW / 편곡' })).toHaveProperty(
    'disabled',
    true,
  );
});
