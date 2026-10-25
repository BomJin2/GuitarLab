import { useState } from 'react';
import type { ProjectController } from './useProjects';
import type { ProjectSummary } from './projects';

export function ProjectMetadataPanel({
  project,
  current,
}: {
  project: ProjectController;
  current: ProjectSummary;
}) {
  const [title, setTitle] = useState(current.title);
  const [artist, setArtist] = useState(current.artist ?? '');
  return (
    <form
      className="panel"
      aria-label="프로젝트 정보 수정"
      onSubmit={(event) => {
        event.preventDefault();
        void project.updateMetadata(title, artist);
      }}
    >
      <h2>프로젝트 정보 수정</h2>
      <p>
        목록의 제목·아티스트만 수정합니다. 악보 안의 제목과 파일 이름은
        유지합니다.
      </p>
      <fieldset className="toolbar" disabled={project.busy || !project.native}>
        <label>
          제목{' '}
          <input
            aria-label="수정할 프로젝트 제목"
            value={title}
            maxLength={400}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          아티스트 · 선택{' '}
          <input
            aria-label="수정할 프로젝트 아티스트"
            value={artist}
            maxLength={400}
            onChange={(event) => setArtist(event.target.value)}
          />
        </label>
        <button disabled={!title.trim()}>프로젝트 정보 저장</button>
      </fieldset>
    </form>
  );
}
