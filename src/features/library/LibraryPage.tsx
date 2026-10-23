import { EmptyState } from '../../components/ui/EmptyState';
import { useState } from 'react';
import type { ProjectController } from './useProjects';
import type { ProjectMode } from './projects';
import { ProjectStatus } from './ProjectStatus';
import { ProjectTrashPanel } from './ProjectTrashPanel';

export function LibraryPage({ project }: { project: ProjectController }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [mode, setMode] = useState<ProjectMode>('practice');
  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">내 프로젝트</h1>
          <p className="mt-2 text-secondary">
            기타 카피와 연습을 위한 로컬 작업 공간
          </p>
        </div>
        <div className="flex gap-3">
          <button
            disabled={!project.native || project.listBusy}
            onClick={() => void project.refresh()}
          >
            프로젝트 목록 새로고침
          </button>
        </div>
      </div>
      <form
        className="panel toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void project.create(title, artist, mode);
        }}
      >
        <label>
          제목{' '}
          <input
            aria-label="프로젝트 제목"
            maxLength={200}
            required
            value={title}
            disabled={project.busy || !project.native}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          아티스트 · 선택{' '}
          <input
            aria-label="프로젝트 아티스트"
            maxLength={200}
            value={artist}
            disabled={project.busy || !project.native}
            onChange={(e) => setArtist(e.target.value)}
          />
        </label>
        <label>
          모드{' '}
          <select
            aria-label="프로젝트 모드"
            value={mode}
            disabled={project.busy || !project.native}
            onChange={(e) =>
              setMode(
                e.target.value === 'copy'
                  ? 'copy'
                  : e.target.value === 'performance'
                    ? 'performance'
                    : 'practice',
              )
            }
          >
            <option value="practice">연습</option>
            <option value="copy">카피</option>
            <option value="performance">연주</option>
          </select>
        </label>
        <button disabled={!project.native || project.busy || !title.trim()}>
          새 프로젝트 만들기
        </button>
      </form>
      {!project.native && (
        <p>
          프로젝트 저장은 Windows 데스크톱 앱에서 사용할 수 있습니다.
          브라우저에서는 악보·음원 미리보기를 사용할 수 있습니다.
        </p>
      )}
      <ProjectStatus project={project} />
      {project.projects.length === 0 ? (
        <EmptyState
          title="첫 프로젝트를 기다리고 있어요"
          description="데스크톱 앱에서 제목을 입력해 프로젝트를 만든 뒤 악보와 음원을 연결하세요."
        />
      ) : (
        <div className="project-list">
          {project.projects.map((item) => (
            <article className="panel" key={item.id}>
              <h2>{item.title}</h2>
              <p>
                {item.artist ?? '아티스트 미지정'} · 버전 {item.revision} ·{' '}
                {new Date(item.updatedAtMs).toLocaleString('ko-KR')}
              </p>
              <button
                disabled={project.busy}
                onClick={() => void project.open(item.id)}
              >
                프로젝트 열기 · {item.title}
              </button>
              <button
                disabled={project.busy}
                onClick={() => void project.trashProject(item)}
              >
                휴지통에 보관 · {item.title}
              </button>
              {project.details?.project.id === item.id && (
                <p>현재 열린 프로젝트 · 보관 완료 후 작업 화면을 닫습니다.</p>
              )}
            </article>
          ))}
        </div>
      )}
      <ProjectTrashPanel project={project} />
    </>
  );
}
