import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
afterEach(cleanup);
beforeEach(() => {
  // jsdom 기본 창(1024×768)은 앱의 작은 창 기준(1100×680) 이하라 패널이 접힌 채 시작합니다.
  // 앱 기본 창 크기(1440×900)로 맞추고, 작은 창은 각 테스트에서 따로 흉내 냅니다.
  if (typeof window !== 'undefined')
    for (const [key, value] of [
      ['innerWidth', 1440],
      ['innerHeight', 900],
    ] as const)
      Object.defineProperty(window, key, {
        value,
        writable: true,
        configurable: true,
      });
  if (typeof HTMLMediaElement === 'undefined') return;
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
    () => undefined,
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => undefined,
  );
});
