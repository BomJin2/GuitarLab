import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { droppedLocalMedia, mediaDropError } from '../score/mediaDrop';
import type { LocalMediaKind } from '../score/localMediaImport';

export function ProjectFileDrop({
  active,
  disabled,
  reference,
  onFile,
  children,
  contextKey,
}: {
  active: boolean;
  disabled: boolean;
  reference: boolean;
  onFile: (kind: LocalMediaKind, file: File) => Promise<void>;
  children: ReactNode;
  contextKey: string;
}) {
  const depth = useRef(0);
  const mounted = useRef(false);
  const context = useRef(contextKey);
  context.current = contextKey;
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const clear = useCallback(() => {
    depth.current = 0;
    setDragging(false);
  }, []);
  useEffect(() => {
    clear();
    setNotice(null);
  }, [contextKey, clear]);
  useEffect(() => {
    mounted.current = true;
    window.addEventListener('blur', clear);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      mounted.current = false;
      window.removeEventListener('blur', clear);
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, [clear]);
  const isFile = (event: DragEvent) =>
    event.dataTransfer.types.includes('Files') ||
    event.dataTransfer.files.length > 0;
  async function drop(event: DragEvent<HTMLDivElement>) {
    if (!active || !isFile(event)) return;
    event.preventDefault();
    event.stopPropagation();
    clear();
    if (disabled || reference) {
      setNotice(
        reference
          ? '외부 참조는 프로젝트 파일 선택 버튼을 사용하세요.'
          : '녹음·채점·보정·파일 작업을 마친 뒤 파일을 놓아주세요.',
      );
      return;
    }
    const current = contextKey;
    try {
      const { kind, file } = droppedLocalMedia(event.dataTransfer);
      setNotice(null);
      await onFile(kind, file);
    } catch (cause) {
      if (mounted.current && context.current === current)
        setNotice(mediaDropError(cause));
    }
  }
  return (
    <div
      className="project-file-drop-frame"
      onDropCapture={drop}
      onDragEnterCapture={(event) => {
        if (active && isFile(event)) {
          event.preventDefault();
          depth.current++;
          setDragging(true);
        }
      }}
      onDragLeaveCapture={() => {
        if (depth.current > 0 && --depth.current === 0) setDragging(false);
      }}
      onDragOverCapture={(event) => {
        if (active && isFile(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect =
            disabled || reference ? 'none' : 'copy';
        }
      }}
    >
      {children}
      {active && dragging && (
        <div
          className="project-file-drop-overlay"
          role="status"
          aria-live="polite"
        >
          <div className="panel">
            <strong>
              {reference
                ? '외부 참조는 파일 선택을 사용하세요'
                : disabled
                  ? '현재 작업을 마친 뒤 놓아주세요'
                  : '여기에 놓아 파일 적용하기'}
            </strong>
            <p>악보 또는 WAV/MP3 파일 한 개 · 관리용 복사</p>
          </div>
        </div>
      )}
      {active && notice && (
        <div className="project-file-drop-notice panel" role="alert">
          <p>{notice}</p>
          <button onClick={() => setNotice(null)}>안내 닫기</button>
        </div>
      )}
    </div>
  );
}
