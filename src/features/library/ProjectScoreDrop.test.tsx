import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectScoreDrop } from './ProjectScoreDrop';
afterEach(cleanup);
function drop(files: File[]) {
  fireEvent.drop(screen.getByLabelText('프로젝트 악보 끌어놓기'), {
    dataTransfer: { files, items: files.map(() => ({ kind: 'file' })) },
  });
}

it('단일 악보만 전달하고 음원·복수 파일은 기존 프로젝트를 바꾸지 않는다', () => {
  const onFile = vi.fn().mockResolvedValue(undefined);
  render(
    <ProjectScoreDrop disabled={false} reference={false} onFile={onFile} />,
  );
  const score = new File(['<score/>'], 'score.xml');
  drop([score]);
  expect(onFile).toHaveBeenCalledWith(score);
  onFile.mockClear();
  drop([new File(['RIFF'], 'audio.wav')]);
  expect(onFile).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toContain('음원 선택');
  drop([score, score]);
  expect(onFile).not.toHaveBeenCalled();
});

it.each([
  { disabled: true, reference: false },
  { disabled: false, reference: true },
])('잠금/외부 참조에서는 파일을 읽거나 보관하지 않는다: %j', (props) => {
  const onFile = vi.fn().mockResolvedValue(undefined);
  render(<ProjectScoreDrop {...props} onFile={onFile} />);
  drop([new File(['<score/>'], 'score.xml')]);
  expect(onFile).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toBeTruthy();
});
