import type { ProjectController } from './useProjects';

export function ProjectTrashPanel({ project }: { project: ProjectController }) {
  return (
    <section className="panel" aria-label="프로젝트 휴지통">
      <h2>프로젝트 휴지통</h2>
      <p>
        보관은 목록에서 숨기는 기능입니다. 악보·녹음·원본은 지우지 않으며 디스크
        공간을 비우지 않습니다. 복원해 다시 열 수 있습니다.
      </p>
      <p>
        현재 열린 프로젝트도 보관할 수 있습니다. 미저장 편집을 먼저 확인하고,
        보관에 성공한 뒤 작업 화면을 닫습니다.
      </p>
      <button
        disabled={!project.native || project.busy || project.trashListBusy}
        onClick={() => void project.refreshTrash()}
      >
        휴지통 목록 다시 읽기
      </button>
      {project.trashListBusy && (
        <p role="status">휴지통 목록을 읽고 있습니다.</p>
      )}
      {project.trashLoaded &&
        !project.trashListBusy &&
        project.trashedProjects.length === 0 && (
          <p>보관된 프로젝트가 없습니다.</p>
        )}
      {project.trashedProjects.map((entry) => (
        <article key={entry.trashId}>
          <p>
            {entry.project.title} · 버전 {entry.project.revision} ·{' '}
            {new Date(entry.trashedAtMs).toLocaleString('ko-KR')}
          </p>
          <button
            disabled={project.busy}
            onClick={() => void project.restoreProject(entry)}
          >
            복원 · {entry.project.title}
          </button>
        </article>
      ))}
    </section>
  );
}
