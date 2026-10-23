import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { dualGuitarSession } from '../../test/dualGuitarFixture';
import { ScoreTrackSelector } from './ScoreTrackSelector';
import { selectScoreTrack, setGuitarRole } from './trackSelection';

afterEach(cleanup);
it('두 기타 이름·사용자 역할·안정적인 ID를 표시하며 오디오 분리를 주장하지 않는다', () => {
  const session = dualGuitarSession();
  const second = session.document.tracks[1];
  if (!second) throw new Error('두 번째 기타 없음');
  const onSelect = vi.fn();
  const onRole = vi.fn();
  const { rerender } = render(
    <ScoreTrackSelector
      session={session}
      onSelect={onSelect}
      onRole={onRole}
    />,
  );
  expect(
    screen.getByRole('option', { name: /^Guitar\s1 · 역할 미지정$/u }),
  ).toBeTruthy();
  expect(
    screen.getByRole('option', { name: /^Guitar\s2 · 역할 미지정$/u }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('악보 트랙'), {
    target: { value: second.id },
  });
  expect(onSelect).toHaveBeenCalledWith(second.id);
  const selected = selectScoreTrack(session, second.id);
  rerender(
    <ScoreTrackSelector
      session={selected}
      onSelect={onSelect}
      onRole={onRole}
    />,
  );
  fireEvent.change(screen.getByLabelText('기타 악보 역할'), {
    target: { value: 'RHYTHM' },
  });
  expect(onRole).toHaveBeenCalledWith(second.id, 'RHYTHM');
  rerender(
    <ScoreTrackSelector
      session={{
        ...selected,
        document: setGuitarRole(selected.document, second.id, 'RHYTHM'),
      }}
      onSelect={onSelect}
      onRole={onRole}
    />,
  );
  expect(
    screen.getByRole('option', { name: /^Guitar\s2 · 리듬$/u }),
  ).toBeTruthy();
  expect(
    screen.getByText(/악보 트랙과 개별 기타 오디오 stem은 별도로 관리/),
  ).toBeTruthy();
});
