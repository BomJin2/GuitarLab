import { describe, expect, it, vi } from 'vitest';
import { preventDroppedFileNavigation } from './fileDrop';

describe('파일 drop 기본 이동 보호', () => {
  it('파일은 기본 탐색을 막고 텍스트 입력의 기본 처리는 유지한다', () => {
    for (const types of [['Files'], ['Files', 'text/plain'], ['text/plain']]) {
      const preventDefault = vi.fn();
      preventDroppedFileNavigation({ dataTransfer: { types }, preventDefault });
      expect(preventDefault).toHaveBeenCalledTimes(
        types.includes('Files') ? 1 : 0,
      );
    }
    const preventDefault = vi.fn();
    preventDroppedFileNavigation({ dataTransfer: null, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
