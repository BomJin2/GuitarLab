import { PlayerProvider } from './features/player/PlayerContext';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { logDiagnostic } from './shared/logger';
import './shared/styles.css';

window.addEventListener('error', () =>
  logDiagnostic('error', 'UNCAUGHT_ERROR'),
);
window.addEventListener('unhandledrejection', () =>
  logDiagnostic('error', 'UNHANDLED_REJECTION'),
);

const root = document.getElementById('root');
if (!root) throw new Error('앱 진입 요소를 찾을 수 없습니다.');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </ErrorBoundary>
  </StrictMode>,
);
