import { useState } from 'react';
import type { RevisionDocument } from './projects';
import { useScoreHistory } from './useScoreHistory';

function RevisionPreview({ revision }: { revision: RevisionDocument }) {
  const [trackIndex, setTrackIndex] = useState(
    revision.workspace.activeTrackIndex,
  );
  const track = revision.score.tracks[trackIndex];
  if (!track) return <p role="alert">저장된 트랙을 찾을 수 없습니다.</p>;
  return (
    <section aria-label="저장 악보 읽기 전용">
      <h3>
        버전 {revision.revision} · {revision.score.title}
      </h3>
      <label>
        저장된 트랙
        <select
          value={trackIndex}
          onChange={(e) => setTrackIndex(Number(e.target.value))}
        >
          {revision.score.tracks.map((item, index) => (
            <option key={item.id} value={index}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        PPQ {revision.score.ppq} · {track.notes.length}음 · 최대 100음 표시
      </p>
      <table>
        <caption>저장된 음표 · 읽기 전용</caption>
        <thead>
          <tr>
            <th>마디</th>
            <th>시작 tick</th>
            <th>길이 tick</th>
            <th>MIDI</th>
            <th>줄</th>
            <th>프렛</th>
          </tr>
        </thead>
        <tbody>
          {track.notes.slice(0, 100).map((note) => (
            <tr key={note.id}>
              <td>{note.measureIndex + 1}</td>
              <td>{note.startTick}</td>
              <td>{note.durationTicks}</td>
              <td>{note.pitchMidi}</td>
              <td>{note.stringIndex ?? '미지정'}</td>
              <td>{note.fret ?? '미지정'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
export function ScoreHistoryPanel({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled: boolean;
}) {
  const history = useScoreHistory(projectId);
  const [selected, setSelected] = useState('');
  const entries = history.page?.entries ?? [];
  const entry =
    entries.find((item) => item.revisionId === selected) ?? entries[0];
  const locked = disabled || history.busy;
  return (
    <section className="panel" aria-label="저장 악보 버전">
      <h3>저장 악보 버전</h3>
      <p>
        저장 내용만 조회합니다. 현재 편집·재생·되돌리기 이력은 유지합니다. 이
        화면에서 이전 버전을 적용하거나 삭제할 수 없습니다.
      </p>
      <div className="toolbar">
        <button disabled={locked} onClick={() => void history.load()}>
          최신 버전 목록 읽기
        </button>
        <button
          disabled={locked || !history.page?.nextBeforeRevision}
          onClick={() =>
            void history.load(history.page?.nextBeforeRevision ?? null)
          }
        >
          이전 버전 목록
        </button>
        <label>
          저장 버전
          <select
            disabled={locked || !entry}
            value={entry?.revisionId ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {entries.map((item) => (
              <option key={item.revisionId} value={item.revisionId}>
                버전 {item.revision} · 저장 시각 {item.createdAtMs} ms
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={locked || !entry}
          onClick={() => {
            if (entry) void history.read(entry);
          }}
        >
          저장 내용 조회
        </button>
      </div>
      {history.page && entries.length === 0 && (
        <p role="status">조회 구간에 저장된 악보가 없습니다.</p>
      )}
      {history.busy && (
        <p role="status">
          {history.canceling ? '조회 취소 처리 중' : '저장 악보 조회 중'}
          <button disabled={history.canceling} onClick={history.cancel}>
            조회 취소
          </button>
        </p>
      )}
      {history.error && <p role="alert">{history.error}</p>}
      {history.notice && <p role="status">{history.notice}</p>}
      {history.preview && (
        <RevisionPreview
          key={history.preview.revisionId}
          revision={history.preview}
        />
      )}
    </section>
  );
}
