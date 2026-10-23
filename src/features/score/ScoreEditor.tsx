import type { FormEvent } from 'react';
import type { ScoreSession } from './scoreSession';
import type { ScoreEditingController } from './useScoreEditing';
import { getActiveTrackIndex } from './trackSelection';
import { noteDurations } from './normalizedNotation';
import { ScoreStructureEditor } from './ScoreStructureEditor';
import { ScoreViewport } from './ScoreViewport';
import { useScoreExport } from './useScoreExport';

export function ScoreEditor({
  session,
  editor,
  locked,
}: {
  session: ScoreSession;
  editor: ScoreEditingController;
  locked: boolean;
}) {
  const exporting = useScoreExport(session.originalBytes);
  const controlsLocked = locked || exporting.busy;
  const track = session.document.tracks[getActiveTrackIndex(session)];
  if (!track) return null;
  const selected = editor.selectedNote;
  const selectedIndex = track.notes.findIndex((n) => n.id === selected?.id);
  function applyForm(element: HTMLFormElement, duplicate = false) {
    if (!track) return;
    const form = new FormData(element);
    const number = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' && value.trim() ? Number(value) : NaN;
    };
    const value = {
      startTick: number('startTick'),
      durationTicks: number('durationTicks'),
      stringIndex: number('stringIndex'),
      fret: number('fret'),
    };
    editor.edit(
      selected && !duplicate
        ? { kind: 'UPDATE', trackId: track.id, noteId: selected.id, value }
        : { kind: 'ADD', trackId: track.id, value },
    );
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyForm(event.currentTarget);
  }
  return (
    <section
      className="panel"
      aria-label="수동 음표 편집"
      onKeyDown={(event) => {
        if (
          controlsLocked ||
          (!event.ctrlKey && !event.metaKey) ||
          event.key.toLowerCase() !== 'z' ||
          (event.target instanceof HTMLElement &&
            event.target.closest(
              'input,textarea,select,[contenteditable="true"]',
            ))
        )
          return;
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      }}
    >
      <h2>수동 음표 편집 · 기본 단성</h2>
      <p>
        원본은 보존하고 편집본을 만듭니다. 반복은 펼친 시간으로 편집하며
        주법·원본 표기는 간소화됩니다. 현재6줄 단성만 지원합니다. 마디/템포
        변경은 반주 싱크 재확인이 필요합니다. 파일 출력은 새 JSON/MusicXML만
        생성합니다.
      </p>
      {!editor.enabled ? (
        <button disabled={controlsLocked} onClick={editor.begin}>
          안내 확인 · 편집 시작
        </button>
      ) : (
        <>
          <div className="toolbar">
            <button
              disabled={controlsLocked || session.document.tracks.length >= 128}
              onClick={() => editor.structure({ kind: 'ADD_GUITAR_TRACK' })}
            >
              기타 트랙 추가
            </button>
            <button
              disabled={controlsLocked || !editor.canUndo}
              onClick={editor.undo}
            >
              되돌리기
            </button>
            <button
              disabled={controlsLocked || !editor.canRedo}
              onClick={editor.redo}
            >
              다시 실행
            </button>
            <label>
              편집할 음표
              <select
                aria-label="편집할 음표"
                disabled={controlsLocked}
                value={selected?.id ?? 'new'}
                onChange={(e) =>
                  editor.selectNote(
                    e.target.value === 'new' ? null : e.target.value,
                  )
                }
              >
                {track.notes.map((n, i) => (
                  <option key={n.id} value={n.id}>
                    {i + 1}번 · tick {n.startTick} · {n.stringIndex}번 줄{' '}
                    {n.fret}프렛
                  </option>
                ))}
                <option value="new">새 음표 추가</option>
              </select>
            </label>
            <button
              disabled={controlsLocked || selectedIndex <= 0}
              onClick={() => editor.moveSelection('previous')}
            >
              이전 음표
            </button>
            <button
              disabled={
                controlsLocked ||
                selectedIndex < 0 ||
                selectedIndex >= track.notes.length - 1
              }
              onClick={() => editor.moveSelection('next')}
            >
              다음 음표
            </button>
          </div>
          <p role="status">
            {selected
              ? `편집 선택: ${selectedIndex + 1}번 · tick ${selected.startTick} · ${selected.stringIndex}번 줄 ${selected.fret}프렛`
              : '편집 선택: 새 음표'}{' '}
            · TAB 숫자나 같은 박자 위치의 줄 영역을 클릭하거나 목록·이전/다음
            버튼으로 선택하세요. 선택을 바꾸면 적용하지 않은 입력값은
            사라집니다. 악보에 초점을 두면 좌/우 화살표로 이동하고 Home/End로
            처음/끝 음표를 선택합니다.
          </p>
          <form
            key={`${track.id}:${selected ? JSON.stringify(selected) : 'new'}`}
            onSubmit={submit}
          >
            <fieldset disabled={controlsLocked}>
              <legend>{selected ? '선택 음표 속성' : '새 음표 속성'}</legend>
              <label>
                시작 tick
                <input
                  aria-label="음표 시작 tick"
                  name="startTick"
                  type="number"
                  min={0}
                  step={60}
                  required
                  defaultValue={selected?.startTick ?? 0}
                />
              </label>
              <label>
                길이
                <select
                  aria-label="음표 길이"
                  name="durationTicks"
                  defaultValue={selected?.durationTicks ?? 480}
                >
                  {noteDurations.map((d) => (
                    <option key={d.ticks} value={d.ticks}>
                      {d.label} · {d.ticks}tick
                    </option>
                  ))}
                </select>
              </label>
              <label>
                줄
                <input
                  aria-label="음표 줄"
                  name="stringIndex"
                  type="number"
                  min={1}
                  max={6}
                  step={1}
                  required
                  defaultValue={selected?.stringIndex ?? 1}
                />
              </label>
              <label>
                프렛
                <input
                  aria-label="음표 프렛"
                  name="fret"
                  type="number"
                  min={0}
                  max={36}
                  step={1}
                  required
                  defaultValue={selected?.fret ?? 0}
                />
              </label>
              <button type="submit">
                {selected ? '음표 수정 적용' : '새 음표 적용'}
              </button>
              {selected && (
                <button
                  type="button"
                  onClick={() =>
                    editor.edit({
                      kind: 'DELETE',
                      trackId: track.id,
                      noteId: selected.id,
                    })
                  }
                >
                  선택 음표 삭제
                </button>
              )}
              {selected && (
                <button
                  type="button"
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    if (form?.reportValidity()) applyForm(form, true);
                  }}
                >
                  입력한 위치에 음표 복제
                </button>
              )}
            </fieldset>
          </form>
          <p>
            960tick=4분음표,480tick=8분음표입니다. 시작은60tick 단위이며 같은
            트랙의 음표를 겹치거나 마디를 넘어 길게 만들 수 없습니다. 편집 후
            ‘프로젝트 저장’으로 새 버전을 저장하세요. 복제할 때는 시작 tick을 빈
            위치로 지정하세요. 패널 버튼에 초점이 있을 때 Ctrl+Z/Shift+Ctrl+Z도
            사용할 수 있습니다.
          </p>
          {editor.document && (
            <ScoreStructureEditor
              document={editor.document}
              trackId={track.id}
              editor={editor}
              locked={controlsLocked}
            />
          )}
          <div className="toolbar">
            <button
              disabled={controlsLocked || !exporting.native || !editor.document}
              onClick={() => {
                if (editor.document)
                  void exporting.export(editor.document, 'JSON');
              }}
            >
              새 JSON으로 내보내기
            </button>
            <button
              disabled={controlsLocked || !exporting.native || !editor.document}
              onClick={() => {
                if (editor.document)
                  void exporting.export(editor.document, 'MUSICXML');
              }}
            >
              새 MusicXML로 내보내기
            </button>
          </div>
          {!exporting.native && (
            <p>새 파일 저장 창은 Windows 앱에서 사용할 수 있습니다.</p>
          )}
        </>
      )}
      <button
        disabled={controlsLocked}
        onClick={
          editor.originalView ? editor.closeComparison : editor.compareOriginal
        }
      >
        {editor.originalView ? '원본 비교 닫기' : '원본 악보 비교 보기'}
      </button>
      {editor.originalView && (
        <section aria-label="읽기 전용 원본 비교">
          <h3>원본 악보 · 읽기 전용 · 시작 위치</h3>
          {editor.originalView.score.tracks[getActiveTrackIndex(session)] ? (
            <ScoreViewport
              score={editor.originalView.score}
              lookup={editor.originalView.playbackLookup}
              trackIndex={getActiveTrackIndex(session)}
              tick={0}
            />
          ) : (
            <p>추가한 트랙은 원본에 없습니다.</p>
          )}
        </section>
      )}
      {exporting.busy && (
        <p role="status">
          악보 출력 중 · {exporting.job?.completedBytes ?? 0}/
          {exporting.job?.totalBytes ?? 0}바이트{' '}
          <button onClick={exporting.cancel}>출력 취소 요청</button>
        </p>
      )}
      {exporting.notice && <p role="status">{exporting.notice}</p>}
      {exporting.error && <p role="alert">{exporting.error}</p>}
      {editor.error && <p role="alert">{editor.error}</p>}
    </section>
  );
}
