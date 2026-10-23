import { useState, type ReactNode } from 'react';
import { isWorkspace, labels, type Route } from './routes';
import { TransportBar } from '../features/player/TransportBar';
export function AppShell({
  route,
  children,
  inputState,
  projectTitle,
  scoreSaved = false,
  recordingLocked = false,
}: {
  route: Route | null;
  children: ReactNode;
  inputState: 'STOPPED' | 'STARTING' | 'RUNNING' | 'ERROR';
  projectTitle?: string;
  scoreSaved?: boolean;
  recordingLocked?: boolean;
}) {
  const workspace = isWorkspace(route);
  const [expanded, setExpanded] = useState(false);
  const collapsed = workspace && !expanded;
  return (
    <div
      className="app-shell"
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
      <header className="top-bar">
        <a href="#/library" className="brand">
          Guitar<span>Lab</span>
        </a>
        <span className="project-title">
          {workspace
            ? projectTitle
              ? `${projectTitle} · ${scoreSaved ? '악보 저장됨' : '악보 미저장'}`
              : '로컬 작업 공간 · 미저장'
            : labels[route ?? 'library']}
        </span>
        {workspace && (
          <nav className="mode-switch" aria-label="작업 모드">
            {(['copy', 'practice', 'performance'] as const).map((mode) => (
              <a
                key={mode}
                href={`#/${mode}`}
                aria-current={route === mode ? 'page' : undefined}
              >
                {labels[mode]}
              </a>
            ))}
          </nav>
        )}
        <a href="#/settings">환경 설정</a>
        <span className="badge">
          {recordingLocked ? '● REC · 준비/녹음/저장 중' : '녹음 꺼짐'} ·{' '}
          {inputState === 'RUNNING'
            ? '입력 분석 중'
            : inputState === 'STARTING'
              ? '입력 시작 중'
              : inputState === 'ERROR'
                ? '입력 오류'
                : '입력 중단'}
        </span>
      </header>
      <div className="app-content">
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label="탐색 패널 전환"
            aria-expanded={!collapsed}
          >
            ☰
          </button>
          <nav aria-label="주 탐색">
            {(
              [
                'library',
                'copy',
                'practice',
                'performance',
                'results',
                'recordings',
                'backing',
                'settings',
              ] as const
            ).map((item) => (
              <a
                key={item}
                href={`#/${item}`}
                aria-label={labels[item]}
                title={labels[item]}
                aria-current={route === item ? 'page' : undefined}
              >
                {labels[item]}
              </a>
            ))}
          </nav>
          {!collapsed && (
            <p className="sidebar-note">
              로컬 우선
              <br />
              {recordingLocked
                ? '● REC · 준비/녹음/저장 중'
                : '녹음 꺼짐'} ·{' '}
              {inputState === 'RUNNING'
                ? '입력 분석 중'
                : inputState === 'STARTING'
                  ? '입력 시작 중'
                  : inputState === 'ERROR'
                    ? '입력 오류'
                    : '입력 중단'}
            </p>
          )}
        </aside>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
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
