import type { ScoreSession } from '../features/score/scoreSession';

type ObservedScore = Pick<
  ScoreSession,
  'originalBytes' | 'document' | 'savedRevision'
>;

// 새로 불러온 문서는 편집으로 보지 않으며 저장/되돌리기는 같은 불변 문서로 비교합니다.
export class ScoreDirtyTracker {
  private source?: Uint8Array;
  private baseline?: ObservedScore['document'];
  observe(session: ObservedScore | null): boolean {
    if (!session) {
      this.source = undefined;
      this.baseline = undefined;
      return false;
    }
    if (this.source !== session.originalBytes) {
      this.source = session.originalBytes;
      this.baseline = session.document;
    }
    return (
      session.document !== (session.savedRevision?.document ?? this.baseline)
    );
  }
}
