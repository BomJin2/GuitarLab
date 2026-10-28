import { useState, type DragEvent } from 'react';
import { droppedLocalMedia, mediaDropError } from '../score/mediaDrop';

export function ProjectScoreDrop({
  disabled,
  reference,
  onFile,
}: {
  disabled: boolean;
  reference: boolean;
  onFile: (file: File) => Promise<void>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  async function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || reference) {
      setNotice(
        reference
          ? '외부 참조는 프로젝트 악보 선택 버튼을 사용하세요.'
          : '녹음·채점·파일 작업을 마친 뒤 악보를 놓아주세요.',
      );
      return;
    }
    try {
      const { kind, file } = droppedLocalMedia(event.dataTransfer);
      if (kind !== 'score') {
        setNotice(
          '음원은 프로젝트 음원 선택 버튼을 사용하세요. 악보만 놓을 수 있습니다.',
        );
        return;
      }
      setNotice(null);
      await onFile(file);
    } catch (cause) {
      setNotice(mediaDropError(cause));
    }
  }
  return (
    <section
      aria-label="프로젝트 악보 끌어놓기"
      onDrop={drop}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled || reference ? 'none' : 'copy';
      }}
    >
      <p>
        악보 파일 한 개를 여기에 놓으면 관리용 복사로 보관합니다. 음원·외부
        참조는 파일 선택을 사용하세요.
      </p>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
