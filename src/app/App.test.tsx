import { PlayerProvider } from '../features/player/PlayerContext';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';

beforeEach(() => {
  window.location.hash = '';
});
describe('앱 기본 탐색', () => {
  it('빈 라이브러리와 미구현 기능을 표시한다', () => {
    render(
      <PlayerProvider>
        <App />
      </PlayerProvider>,
    );
    expect(screen.getByRole('heading', { name: '내 프로젝트' })).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: '새 프로젝트 만들기' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it('설정 경로와 잘못된 경로를 처리한다', () => {
    render(
      <PlayerProvider>
        <App />
      </PlayerProvider>,
    );
    window.location.hash = '#/settings';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByRole('heading', { name: '환경 설정' })).toBeTruthy();
    window.location.hash = '#/missing';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(
      screen.getByRole('heading', { name: '페이지를 찾을 수 없습니다' }),
    ).toBeTruthy();
  });
  it('반주 찾기는 명시적 연결 전 오프라인이며 로컬 transport를 표시하지 않는다', () => {
    window.location.hash = '#/backing';
    render(
      <PlayerProvider>
        <App />
      </PlayerProvider>,
    );
    expect(screen.getByRole('heading', { name: '반주 찾기' })).toBeTruthy();
    expect(
      screen.queryByRole('contentinfo', { name: '재생 컨트롤' }),
    ).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/저장 없이 직접 열기도 가능합니다/)).toBeTruthy();
  });
  it('렌더 오류 원문을 진단 로그에 노출하지 않는다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Broken(): never {
      throw new Error('민감한 경로');
    }
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(spy).toHaveBeenCalledWith('[GuitarLab]', 'APP_RENDER_FAILED');
    spy.mockRestore();
  });
});

it('모드 전환과 키보드 패널 조절을 지원한다', () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.keyDown(window, { key: '2', altKey: true });
  fireEvent(window, new HashChangeEvent('hashchange'));
  expect(screen.getByRole('heading', { name: '연습 작업 공간' })).toBeTruthy();
  const separator = screen.getByRole('separator');
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(separator.getAttribute('aria-valuenow')).toBe('276');
  fireEvent.click(screen.getByRole('button', { name: '패널 접기' }));
  expect(screen.queryByRole('separator')).toBeNull();
  fireEvent.keyDown(window, { key: '?' });
  expect(screen.getByRole('heading', { name: '키보드 조작' })).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('heading', { name: '키보드 조작' })).toBeNull();
});
it('본문 이동 링크는 경로를 바꾸지 않는다', () => {
  render(
    <PlayerProvider>
      <App />
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('link', { name: '본문으로 이동' }));
  expect(window.location.hash).toBe('');
  expect(document.activeElement?.id).toBe('main');
});
