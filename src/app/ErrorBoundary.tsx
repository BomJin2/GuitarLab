import { Component, type ReactNode } from 'react';
import { logDiagnostic } from '../shared/logger';

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    logDiagnostic('error', 'APP_RENDER_FAILED');
  }
  render() {
    if (this.state.failed)
      return (
        <main role="alert" className="p-8">
          <h1>화면을 표시할 수 없습니다</h1>
          <p>앱을 다시 열어주세요. 음원과 녹음은 수집하지 않았습니다.</p>
          <button onClick={() => window.location.reload()}>다시 시도</button>
        </main>
      );
    return this.props.children;
  }
}
