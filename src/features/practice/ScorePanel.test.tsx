import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { practiceFixture } from '../../test/practiceFixture';
import type { PracticeController } from './usePractice';
import { ScorePanel } from './ScorePanel';
function controller(): PracticeController {
  return {
    armed: false,
    persistent: false,
    snapshot: null,
    history: [],
    error: null,
    waiting: '채점 꺼짐',
    unavailable: null,
    environment: 'HEADPHONES',
    setEnvironment: vi.fn(),
    settings: { coolMs: 50, goodMs: 120, pitchToleranceCents: 50 },
    setSettings: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}
it('실제 입력 전에는 예시 점수를 표시하지 않고 시작은 명시적 버튼으로 처리한다', () => {
  const practice = controller();
  render(<ScorePanel practice={practice} />);
  expect(screen.queryByText('085,400')).toBeNull();
  expect(screen.getByText('COOL · —')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '채점 시작' }));
  expect(practice.start).toHaveBeenCalledOnce();
});
it('실제 서버 점수·콤보·타이밍과 보정값을 표시하며 조건 변경을 잠근다', () => {
  render(
    <ScorePanel
      practice={{ ...controller(), armed: true, snapshot: practiceFixture() }}
    />,
  );
  expect(screen.getByText('1,000')).toBeTruthy();
  expect(screen.getByText('COOL · EARLY 25.0 ms')).toBeTruthy();
  expect(screen.getByText(/적용 보정 45.82 ms/)).toBeTruthy();
  expect(
    screen.getByLabelText('채점 모니터 환경').hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen.getByRole('button', { name: '채점 중단' }).hasAttribute('disabled'),
  ).toBe(false);
});
