import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import type { Route } from './routes';

vi.mock('../features/player/TransportBar', () => ({
  TransportBar: () => null,
}));
afterEach(cleanup);

it('화면마다 스크롤 위치를 기억하고 작업 공간 세 모드는 위치를 공유한다', () => {
  const shell = (route: Route) => (
    <AppShell route={route} inputState="STOPPED">
      <p>{route}</p>
    </AppShell>
  );
  const view = render(shell('settings'));
  const main = view.container.querySelector('main') as HTMLElement;
  const scroll = (top: number) => {
    main.scrollTop = top;
    fireEvent.scroll(main);
  };
  scroll(640);
  view.rerender(shell('library'));
  expect(main.scrollTop).toBe(0);
  scroll(120);
  view.rerender(shell('settings'));
  expect(main.scrollTop).toBe(640);
  view.rerender(shell('copy'));
  expect(main.scrollTop).toBe(0);
  scroll(300);
  view.rerender(shell('practice'));
  expect(main.scrollTop).toBe(300);
  view.rerender(shell('library'));
  expect(main.scrollTop).toBe(120);
});
