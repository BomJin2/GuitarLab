import { useState } from 'react';
import type { ProjectController } from './useProjects';
import { ScoreHistoryPanel } from './ScoreHistoryPanel';
import { ProjectScoreDrop } from './ProjectScoreDrop';
export function ProjectStatus({
  project,
  importBlocked = false,
}: {
  project: ProjectController;
  importBlocked?: boolean;
}) {
  const [storage, setStorage] = useState<'MANAGED' | 'REFERENCE'>('MANAGED');
  const [showHistory, setShowHistory] = useState(false);
  return (
    <section className="panel project-status" aria-label="프로젝트 저장">
      {project.details ? (
        <>
          <strong>
            {project.details.project.title} · 저장 버전{' '}
            {project.details.project.revision}
          </strong>
          <span className="badge">
            {project.scoreSaved ? '악보 저장됨' : '악보 미저장'}
          </span>
          <p>
            재생 위치·배속·반복 구간도 저장 버튼으로 기록합니다. 원본 파일을
            덮어쓰지 않습니다.
          </p>
          <div className="toolbar">
            <button
              disabled={project.busy}
              onClick={() => void project.createBlankScore()}
            >
              빈 악보 만들기
            </button>
            <label>
              원본 보관{' '}
              <select
                aria-label="원본 보관 방식"
                value={storage}
                disabled={project.busy}
                onChange={(e) =>
                  setStorage(
                    e.target.value === 'REFERENCE' ? 'REFERENCE' : 'MANAGED',
                  )
                }
              >
                <option value="MANAGED">관리용 복사 · 기본</option>
                <option value="REFERENCE">외부 파일 참조</option>
              </select>
            </label>
            <button
              disabled={project.busy}
              onClick={() => void project.importAsset('SCORE_IMPORT', storage)}
            >
              프로젝트 악보 선택
            </button>
            <button
              disabled={project.busy}
              onClick={() => void project.importAsset('ORIGINAL', storage)}
            >
              프로젝트 음원 선택
            </button>
            <button disabled={project.busy} onClick={() => void project.save()}>
              프로젝트 저장
            </button>
            {project.native && (
              <button
                aria-expanded={showHistory}
                onClick={() => setShowHistory(!showHistory)}
              >
                저장 악보 버전 {showHistory ? '닫기' : '보기'}
              </button>
            )}
            <button
              disabled={project.busy}
              onClick={() => {
                if (project.details)
                  void project.open(project.details.project.id);
              }}
            >
              프로젝트 다시 열기
            </button>
          </div>
          <ProjectScoreDrop
            key={project.details.project.id}
            disabled={project.busy || importBlocked}
            reference={storage === 'REFERENCE'}
            onFile={(file) =>
              project.importAsset('SCORE_IMPORT', storage, file)
            }
          />
          {project.native && showHistory && (
            <ScoreHistoryPanel
              key={project.details.project.id}
              projectId={project.details.project.id}
              disabled={project.busy}
            />
          )}
          {project.details.assets.length > 0 && (
            <ul>
              {project.details.assets.map((asset) => (
                <li key={asset.id}>
                  {asset.name} ·{' '}
                  {asset.storage === 'MANAGED' ? '관리용 복사' : '외부 참조'} ·{' '}
                  {(asset.bytes / 1048576).toFixed(2)} MiB ·{' '}
                  {asset.available ? '연결됨' : '파일 누락'}
                  {
                    <button
                      disabled={project.busy}
                      onClick={() => void project.relink(asset.id)}
                    >
                      원본 재연결 · {asset.name}
                    </button>
                  }
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p>
          프로젝트를 만들거나 열면 악보·재생 설정·다음 연습 기록을 로컬에 저장할
          수 있습니다. <a href="#/library">라이브러리 열기</a>
        </p>
      )}
      {project.busy && (
        <p role="status">
          {project.job?.state === 'PICKING'
            ? '원본 파일을 선택해주세요'
            : project.job?.state === 'CANCELING'
              ? '취소 처리 중'
              : '프로젝트 작업 중'}
          {Boolean(project.job?.totalBytes) &&
            ` · ${Math.round((100 * (project.job?.completedBytes ?? 0)) / (project.job?.totalBytes ?? 1))}%`}
          <button onClick={project.cancel}>파일 작업 취소</button>
        </p>
      )}
      {project.error && <p role="alert">{project.error}</p>}
      {project.notice && <p role="status">{project.notice}</p>}
    </section>
  );
}
