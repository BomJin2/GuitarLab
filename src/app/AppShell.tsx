import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { isWorkspace, labels, type Route } from './routes';
import { TransportBar } from '../features/player/TransportBar';
import { preventDroppedFileNavigation } from '../shared/fileDrop';
import { MenuBar } from './MenuBar';

// v2 시안의 화면 탭 줄. 반주 찾기는 도구 메뉴, 환경 설정은 ⚙ 버튼과 메뉴에서 엽니다.
const tabs = [
  'library',
  'copy',
  'practice',
  'performance',
  'recordings',
  'results',
] as const;

export function AppShell({
  route,
  children,
  inputState,
  projectTitle,
  scoreSaved = false,
  recordingLocked = false,
  onHelp,
  onNotices,
  view = 'score',
  onViewChange,
  mixer,
  edit,
}: {
  route: Route | null;
  children: ReactNode;
  inputState: 'STOPPED' | 'STARTING' | 'RUNNING' | 'ERROR';
  projectTitle?: string;
  scoreSaved?: boolean;
  recordingLocked?: boolean;
  onHelp?: () => void;
  onNotices?: () => void;
  view?: 'score' | 'daw';
  onViewChange?: (view: 'score' | 'daw') => void;
  /** docs/12 "하단 믹서 v1": 작업 화면에서 전송 바 위에 표시합니다. */
  mixer?: ReactNode;
  /** 메뉴의 실행 취소·다시 실행. 지금 할 수 없으면 함수가 비어 있습니다. */
  edit?: { undo?: () => void; redo?: () => void };
}) {
  const workspace = isWorkspace(route);
  // 보기 전환은 카피·연습·연주에서만, 녹음 잠금 중에는 막습니다(docs/12 DAW 보기 v1).
  const changeView = workspace && !recordingLocked ? onViewChange : undefined;
  // 화면마다 마지막 스크롤 위치를 기억합니다. 카피·연습·연주는 같은 악보 작업 공간이라 하나로 공유합니다.
  const main = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const scrollKey = workspace ? 'workspace' : (route ?? 'missing');
  useLayoutEffect(() => {
    if (main.current)
      main.current.scrollTop = positions.current.get(scrollKey) ?? 0;
  }, [scrollKey]);
  const input =
    inputState === 'RUNNING'
      ? '입력 분석 중'
      : inputState === 'STARTING'
        ? '입력 시작 중'
        : inputState === 'ERROR'
          ? '입력 오류'
          : '입력 중단';
  const saveState = projectTitle
    ? scoreSaved
      ? '악보 저장됨'
      : '악보 미저장'
    : '로컬 작업 공간 · 미저장';
  return (
    <div
      className="app-shell"
      onDropCapture={preventDroppedFileNavigation}
      onDragOverCapture={preventDroppedFileNavigation}
      onClickCapture={(event) => {
        if (
          recordingLocked &&
          event.target instanceof Element &&
          event.target.closest('a[href^="#/"]')
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        본문으로 이동
      </a>
      {recordingLocked && (
        <div className="rec-banner" role="status">
          ● REC · 준비/녹음/저장 중 · 다른 화면으로 이동할 수 없습니다
        </div>
      )}
      <header className="menu-bar">
        <a href="#/library" className="brand">
          GUITARLAB
        </a>
        <MenuBar
          onHelp={onHelp}
          onNotices={onNotices}
          onView={changeView}
          edit={edit}
        />
        <span className="menu-bar-status">
          <span aria-hidden="true" className="status-dot" />
          {recordingLocked ? '● REC · 준비/녹음/저장 중' : '녹음 꺼짐'} ·{' '}
          {input}
        </span>
      </header>
      <div className="song-bar">
        <div className="song-title">
          <strong className="project-title">
            {workspace
              ? (projectTitle ?? '로컬 작업 공간 · 미저장')
              : labels[route ?? 'library']}
          </strong>
          <span>{workspace ? saveState : '로컬 우선 · 기타 카피·연습'}</span>
        </div>
        <div
          className="workspace-switch"
          role="group"
          aria-label="작업 공간 보기"
        >
          <span className="section-label">작업 공간</span>
          <button
            aria-pressed={view === 'score'}
            disabled={!changeView}
            onClick={() => changeView?.('score')}
          >
            악보 / 편집
          </button>
          <button
            aria-pressed={view === 'daw'}
            disabled={!changeView}
            onClick={() => changeView?.('daw')}
          >
            DAW / 편곡
          </button>
        </div>
        <a href="#/settings" className="icon-link" title="환경 설정">
          ⚙<span className="sr-only">환경 설정</span>
        </a>
      </div>
      <nav className="tab-bar" aria-label="주 탐색">
        {tabs.map((item) => (
          <a
            key={item}
            href={`#/${item}`}
            aria-current={route === item ? 'page' : undefined}
          >
            {labels[item]}
          </a>
        ))}
      </nav>
      <div className="app-content">
        <main
          id="main"
          tabIndex={-1}
          ref={main}
          onScroll={(event) =>
            positions.current.set(scrollKey, event.currentTarget.scrollTop)
          }
        >
          {children}
        </main>
      </div>
      {workspace && mixer}
      {route !== 'backing' && (
        <TransportBar
          workspace={workspace}
          preparePlayback={route === 'practice' || route === 'performance'}
          locked={recordingLocked}
        />
      )}
    </div>
  );
}
