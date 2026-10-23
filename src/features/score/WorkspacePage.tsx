import { Panel } from '../../components/ui/Panel';
import { ResizablePanel } from '../../components/ui/ResizablePanel';
import { ScorePreview } from './ScorePreview';
import { Fretboard } from '../practice/Fretboard';
import { ScorePanel } from '../practice/ScorePanel';
import { labels } from '../../app/routes';
export function WorkspacePage({
  mode,
}: {
  mode: 'copy' | 'practice' | 'performance';
}) {
  const copy = mode === 'copy';
  return (
    <div className="workspace">
      <div className="page-heading">
        <h1>{labels[mode]} 작업 공간</h1>
        <span className="badge">DEMO · 화면 프리뷰</span>
      </div>
      <p className="notice">
        실제 악보·오디오·입력·채점·녹음 기능은 연결되지 않았습니다.
      </p>
      {copy && (
        <Panel title="음원 파형">
          <p>음원 불러오기와 싱크 앵커 · 준비 중</p>
        </Panel>
      )}
      <ResizablePanel
        label={copy ? '속성 패널 너비' : '판정 패널 너비'}
        side={
          copy ? (
            <Panel title="음표 속성">
              <p>음표 선택 후 줄/프렛/길이를 표시합니다.</p>
              <button disabled>AI 카피 · 준비 중</button>
              <button disabled>수동 편집 · 준비 중</button>
            </Panel>
          ) : (
            <ScorePanel />
          )
        }
      >
        <div className="workspace-score">
          <ScorePreview />
          {!copy && <Fretboard demo />}
        </div>
      </ResizablePanel>
      {mode === 'performance' && (
        <Panel title="연주 트랙 / 믹서 / 테이크">
          <p>
            DEMO · Lead/Rhythm 악보 선택 프리뷰. 분리 오디오가 있다는 의미는
            아닙니다.
          </p>
          <div className="toolbar">
            <button disabled>REC 시작 · 준비 중</button>
            <button disabled>녹음 다시 듣기</button>
            <button disabled>A/B 비교</button>
            <button disabled>WAV 내보내기</button>
          </div>
        </Panel>
      )}
    </div>
  );
}
