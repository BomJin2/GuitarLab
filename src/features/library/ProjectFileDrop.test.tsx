import { useEffect } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectFileDrop } from './ProjectFileDrop';
afterEach(cleanup);
function transfer(files: File[] = []) {
  return {
    types: ['Files'],
    files,
    items: files.map(() => ({ kind: 'file' })),
    dropEffect: 'move',
  };
}
function harness(
  overrides: { active?: boolean; disabled?: boolean; reference?: boolean } = {},
) {
  const onFile = vi.fn().mockResolvedValue(undefined);
  const childDrop = vi.fn();
  const props = {
    active: true,
    disabled: false,
    reference: false,
    contextKey: 'project:copy',
    onFile,
    ...overrides,
  };
  const view = render(
    <ProjectFileDrop {...props}>
      <section onDrop={childDrop}>
        <button>작업 화면</button>
        <p>악보 영역</p>
      </section>
    </ProjectFileDrop>,
  );
  return {
    ...view,
    onFile,
    childDrop,
    props,
    target: screen.getByText('악보 영역'),
  };
}

it.each([
  { name: 'score.musicxml', kind: 'score' },
  { name: 'audio.wav', kind: 'audio' },
  { name: 'audio.mp3', kind: 'audio' },
])(
  '작업 화면의 하위 아무 곳에서 $name을 단 한 번 전달한다',
  ({ name, kind }) => {
    const { target, onFile, childDrop } = harness();
    const file = new File(['data'], name);
    fireEvent.drop(target, { dataTransfer: transfer([file]) });
    expect(onFile).toHaveBeenCalledWith(kind, file);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(childDrop).not.toHaveBeenCalled();
  },
);

it('파일이 들어오면 안내를 표시하고 내부 이동에서는 유지하며 밖으로 나가면 숨긴다', () => {
  const { target } = harness();
  const dataTransfer = transfer();
  fireEvent.dragEnter(target.parentElement!, { dataTransfer });
  expect(screen.getByRole('status').textContent).toContain(
    '여기에 놓아 파일 적용하기',
  );
  fireEvent.dragEnter(target, { dataTransfer });
  fireEvent.dragLeave(target, { dataTransfer });
  expect(screen.getByRole('status')).toBeTruthy();
  fireEvent.dragLeave(target.parentElement!, { dataTransfer });
  expect(screen.queryByRole('status')).toBeNull();
});

it.each(['blur', 'dragend', 'drop'])(
  '창의 %s로 중단된 드래그 안내가 남지 않는다',
  (event) => {
    const { target } = harness();
    fireEvent.dragEnter(target, { dataTransfer: transfer() });
    act(() => window.dispatchEvent(new Event(event)));
    expect(screen.queryByRole('status')).toBeNull();
  },
);

it.each([{ disabled: true }, { reference: true }])(
  '작업 잠금/참조 선택에서는 읽지 않고 놓기 금지를 알린다: %j',
  (overrides) => {
    const { target, onFile } = harness(overrides);
    const dataTransfer = transfer([new File(['data'], 'score.xml')]);
    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('none');
    fireEvent.drop(target, { dataTransfer });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  },
);

it('복수 파일·폴더와 과도한 파일은 처리하지 않는다', () => {
  const { target, onFile } = harness();
  const score = new File(['x'], 'score.xml');
  fireEvent.drop(target, { dataTransfer: transfer([score, score]) });
  const folder = transfer([score]);
  Object.assign(folder.items[0]!, {
    webkitGetAsEntry: () => ({ isDirectory: true }),
  });
  fireEvent.drop(target, { dataTransfer: folder });
  const big = new File(['x'], 'audio.wav');
  Object.defineProperty(big, 'size', { value: 256 * 1024 * 1024 + 1 });
  fireEvent.drop(target, { dataTransfer: transfer([big]) });
  expect(onFile).not.toHaveBeenCalled();
});

it('일반 텍스트 드래그와 비활성 화면은 가로채지 않는다', () => {
  const { target, childDrop, onFile } = harness({ active: false });
  fireEvent.drop(target, {
    dataTransfer: transfer([new File(['x'], 'score.xml')]),
  });
  expect(childDrop).toHaveBeenCalledOnce();
  expect(onFile).not.toHaveBeenCalled();
});

it('열린 프로젝트에서도 텍스트 드래그는 하위 입력으로 전달한다', () => {
  const { target, childDrop, onFile } = harness();
  fireEvent.dragEnter(target, {
    dataTransfer: { types: ['text/plain'], files: [], items: [] },
  });
  fireEvent.drop(target, {
    dataTransfer: { types: ['text/plain'], files: [], items: [] },
  });
  expect(childDrop).toHaveBeenCalledOnce();
  expect(onFile).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).toBeNull();
});

it('프로젝트/모드 문맥 변경은 안내만 지우며 기존 화면을 다시 만들지 않는다', () => {
  const mounted = vi.fn();
  const unmounted = vi.fn();
  function Child() {
    useEffect(() => {
      mounted();
      return unmounted;
    }, []);
    return <p>기존 화면</p>;
  }
  const props = {
    active: true,
    disabled: false,
    reference: false,
    onFile: vi.fn().mockResolvedValue(undefined),
  };
  const view = render(
    <ProjectFileDrop {...props} contextKey="a">
      <Child />
    </ProjectFileDrop>,
  );
  fireEvent.dragEnter(screen.getByText('기존 화면'), {
    dataTransfer: transfer(),
  });
  view.rerender(
    <ProjectFileDrop {...props} contextKey="b">
      <Child />
    </ProjectFileDrop>,
  );
  expect(screen.queryByRole('status')).toBeNull();
  expect(mounted).toHaveBeenCalledOnce();
  expect(unmounted).not.toHaveBeenCalled();
});
