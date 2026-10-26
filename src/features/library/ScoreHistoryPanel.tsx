import { useState } from 'react';
import type { RevisionDocument } from './projects';
import { useScoreHistory } from './useScoreHistory';
import { useScoreExport } from '../score/useScoreExport';
import { useRevisionScorePreview } from './useRevisionScorePreview';
import { ScoreViewport } from '../score/ScoreViewport';

const emptyPreview = {};

function RevisionPreview({
  revision,
  preview,
  disabled,
}: {
  revision: RevisionDocument;
  preview: ReturnType<typeof useRevisionScorePreview>;
  disabled: boolean;
}) {
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
      <button
        disabled={!preview.eligible || (!preview.open && disabled)}
        aria-expanded={preview.open}
        onClick={() => {
          if (preview.open) preview.hide();
          else void preview.show();
        }}
      >
        저장 TAB {preview.open ? '닫기' : '보기'}
      </button>
      {!preview.eligible && (
        <p>
          원본 파일 기반 TAB는 Windows 앱에서 등록 원본을 확인한 뒤 볼 수
          있습니다.
        </p>
      )}
      {preview.busy && (
        <p role="status">
          {preview.open ? '저장 원본 읽는 중' : '원본 읽기 취소 처리 중'}
          {preview.job
            ? ` · ${preview.job.completedBytes}/${preview.job.totalBytes}바이트`
            : ''}
        </p>
      )}
      {preview.open && (
        <section aria-label="저장 TAB 미리보기">
          <p>
            조회한 버전의 읽기 전용 TAB입니다. 현재 악보·재생 위치는 바뀌지
            않습니다.
          </p>
          {preview.error && <p role="alert">{preview.error}</p>}
          {revision.score.renderSource !== 'NORMALIZED' && (
            <p>이 버전에 연결된 등록 원본을 표시합니다.</p>
          )}
          {preview.value && !preview.value.score.tracks[trackIndex] && (
            <p role="alert">
              원본에서 저장된 트랙을 찾을 수 없습니다. 아래 표는 유지합니다.
            </p>
          )}
          {preview.value && preview.value.score.tracks[trackIndex] && (
            <ScoreViewport
              score={preview.value.score}
              lookup={preview.value.playbackLookup}
              trackIndex={trackIndex}
              tick={null}
            />
          )}
        </section>
      )}
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
  const preview = useRevisionScorePreview(history.preview);
  const exporting = useScoreExport(history.preview ?? emptyPreview);
  const [selected, setSelected] = useState('');
  const entries = history.page?.entries ?? [];
  const entry =
    entries.find((item) => item.revisionId === selected) ?? entries[0];
  const locked = disabled || history.busy || exporting.busy || preview.busy;
  const exportLocked =
    locked ||
    !exporting.native ||
    history.preview?.score.renderSource !== 'NORMALIZED';
  return (
    <section className="panel" aria-label="저장 악보 버전">
      <h3>저장 악보 버전</h3>
      <p>
        저장 내용만 조회합니다. 현재 편집·재생·되돌리기 이력은 유지합니다. 이
        화면에서 이전 버전을 직접 적용하거나 삭제할 수 없습니다. 조회한 편집본은
        별도 새 파일로 내보낼 수 있습니다.
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
        <>
          <RevisionPreview
            key={history.preview.revisionId}
            revision={history.preview}
            preview={preview}
            disabled={locked}
          />
          <section aria-label="조회 버전 내보내기">
            <p>
              출력 대상: 조회한 버전 {history.preview.revision} · 전체 트랙.
              현재 편집본과 저장 버전은 바뀌지 않습니다. 프로젝트 전체 백업은
              아닙니다.
            </p>
            <div className="toolbar">
              <button
                disabled={exportLocked}
                onClick={() => {
                  if (history.preview?.score.renderSource === 'NORMALIZED')
                    void exporting.export(history.preview.score, 'JSON');
                }}
              >
                조회 버전을 새 JSON으로 내보내기
              </button>
              <button
                disabled={exportLocked}
                onClick={() => {
                  if (history.preview?.score.renderSource === 'NORMALIZED')
                    void exporting.export(history.preview.score, 'MUSICXML');
                }}
              >
                조회 버전을 새 MusicXML로 내보내기
              </button>
            </div>
            {history.preview.score.renderSource !== 'NORMALIZED' && (
              <p>
                이 버전은 원본 파일 기반이어서 저장 편집본 출력 대상이 아닙니다.
              </p>
            )}
            {!exporting.native && (
              <p>새 파일 저장은 Windows 앱에서 가능합니다.</p>
            )}
            {exporting.busy && (
              <p role="status">
                조회한 버전 파일 출력 중{' '}
                <button onClick={exporting.cancel}>버전 출력 취소</button>
              </p>
            )}
            {exporting.error && <p role="alert">{exporting.error}</p>}
            {exporting.notice && <p role="status">{exporting.notice}</p>}
          </section>
        </>
      )}
    </section>
  );
}
