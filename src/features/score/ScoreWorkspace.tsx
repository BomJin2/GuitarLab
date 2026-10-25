import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { importLocalMedia } from './localMediaImport';
import { droppedLocalMedia, mediaDropError } from './mediaDrop';
import { scoreArchiveErrorMessage } from './scoreArchive';
import { blankScoreFile } from './blankScore';
import type { ScoreSession } from './scoreSession';
import type { SyncAnchor } from '../../entities/score';
import { audioTimeToScoreTick, validateAnchors } from '../player/sync';
import { timingAt, validateTiming } from '../player/timing';
import { usePlayer } from '../player/usePlayer';
import { LatestTask } from '../../shared/latestTask';
import { ScoreViewport } from './ScoreViewport';
import { ScoreDisplayControls } from './ScoreDisplayControls';
import { ScoreLoopPanel } from './ScoreLoopPanel';
import type { ScoreDisplaySettings } from './scoreDisplay';
import { renderedNoteId } from './scoreNoteSelection';
import { Fretboard } from '../practice/Fretboard';
import { ResizablePanel } from '../../components/ui/ResizablePanel';
import { Panel } from '../../components/ui/Panel';
import { labels } from '../../app/routes';
import { InputPanel } from '../practice/InputPanel';
import { AiDraftPanel } from '../transcription/AiDraftPanel';
import { StemSeparationPanel } from '../transcription/StemSeparationPanel';
import type { AudioInputController } from '../practice/useAudioInput';
import type { ClockState } from '../player/useCaptureClock';
import { ScorePanel } from '../practice/ScorePanel';
import type { PracticeController } from '../practice/usePractice';
import { ProjectStatus } from '../library/ProjectStatus';
import type { ProjectController } from '../library/useProjects';
import { ScoreTrackSelector } from './ScoreTrackSelector';
import { ScoreEditor } from './ScoreEditor';
import type { ScoreEditingController } from './useScoreEditing';
import {
  getActiveTrackIndex,
  selectScoreTrack,
  setGuitarRole,
} from './trackSelection';
const defaults: SyncAnchor[] = [
  { scoreTick: 0, audioTimeMs: 0 },
  { scoreTick: 3840, audioTimeMs: 2000 },
];
export function ScoreWorkspace({
  session,
  setSession,
  mode,
  input,
  clock,
  practice,
  project,
  editor,
  beforeReplace,
  display,
  onDisplayChange,
  playbackLocked = false,
}: {
  session: ScoreSession | null;
  setSession: Dispatch<SetStateAction<ScoreSession | null>>;
  mode: 'copy' | 'practice' | 'performance';
  input: AudioInputController;
  clock: ClockState;
  practice: PracticeController;
  project?: ProjectController;
  editor?: ScoreEditingController;
  beforeReplace: () => boolean | Promise<boolean>;
  display: ScoreDisplaySettings;
  onDisplayChange: (settings: ScoreDisplaySettings) => void;
  playbackLocked?: boolean;
}) {
  const { engine, state } = usePlayer();
  const [draft, setDraft] = useState<SyncAnchor[]>(
    session?.document.syncAnchors ?? defaults,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const task = useRef(new LatestTask());
  const importing = useRef(false);
  const activeSession = useRef(session);
  activeSession.current = session;
  const importBlocked =
    playbackLocked || practice.armed || !!project?.busy || !!project?.details;
  const latestImportBlocked = useRef(importBlocked);
  latestImportBlocked.current = importBlocked;
  useEffect(() => {
    const current = task.current;
    return () => current.cancel();
  }, []);
  useEffect(() => {
    setDraft(session?.document.syncAnchors ?? defaults);
  }, [session?.document.id, session?.document.syncAnchors]);
  const anchors = session?.document.syncAnchors ?? defaults;
  const tick = audioTimeToScoreTick(anchors, state.audioTimeMs);
  const track = session ? getActiveTrackIndex(session) : 0;
  const notes = session?.document.tracks[track]?.notes ?? [];
  const target = notes.find(
    (note) =>
      tick >= note.startTick && tick < note.startTick + note.durationTicks,
  );
  const next = notes.find((note) => note.startTick > tick);
  const timing = useMemo(
    () =>
      session
        ? timingAt(session.document, state.audioTimeMs)
        : { bpm: 120, numerator: 4, denominator: 4 },
    [session, state.audioTimeMs],
  );
  useEffect(() => {
    try {
      engine.setTiming(timing);
    } catch {
      setError('싱크가 지원 템포 범위를 벗어났습니다. 앵커를 조절하세요.');
    }
  }, [engine, timing]);
  async function load(
    kind: 'score' | 'audio',
    getFile: (signal: AbortSignal) => Promise<File>,
  ) {
    if (importing.current || latestImportBlocked.current) return;
    importing.current = true;
    const source = activeSession.current;
    setLoading(true);
    setError(null);
    setNotice(null);
    const result = await task.current.run(async (signal) => {
      if (kind === 'score') {
        let accepted: boolean;
        try {
          accepted = await beforeReplace();
        } catch {
          throw new Error('SCORE_CONFIRM_FAILED');
        }
        if (
          accepted !== true ||
          signal.aborted ||
          activeSession.current !== source
        )
          return null;
      }
      if (signal.aborted || latestImportBlocked.current) return null;
      const file = await getFile(signal);
      const imported = await importLocalMedia(kind, file, signal);
      return latestImportBlocked.current ||
        (kind === 'score' && activeSession.current !== source)
        ? null
        : imported;
    });
    importing.current = false;
    if (result.status === 'canceled') return;
    setLoading(false);
    if (result.status === 'error') {
      setError(
        scoreArchiveErrorMessage(result.error) ??
          (result.error instanceof Error &&
          result.error.message === 'SCORE_CONFIRM_FAILED'
            ? '악보 교체 확인을 열지 못했습니다. 기존 편집을 유지합니다.'
            : result.error instanceof Error &&
                result.error.message === 'LOCAL_FIXTURE_READ_FAILED'
              ? '앱에 포함된 테스트 파일을 읽지 못했습니다. (LOCAL_FIXTURE_READ_FAILED)'
              : kind === 'score'
                ? '악보를 불러올 수 없습니다. 8MiB 이하의 GP/MusicXML 또는 GuitarLab JSON 악보를 선택하세요.'
                : '음원을 불러올 수 없습니다. 256MiB 이하의 유효한 WAV/MP3 파일을 선택하세요.'),
      );
      return;
    }
    if (!result.value) {
      setNotice(
        '기존 악보와 편집을 유지했습니다. 저장한 뒤 다시 불러올 수 있습니다.',
      );
      return;
    }
    engine.pause();
    if (result.value.kind === 'score') setSession(result.value.session);
    else engine.load(result.value.file);
  }
  const choose =
    (kind: 'score' | 'audio') => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void load(kind, async () => file);
    };
  function dropMedia(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (
      playbackLocked ||
      practice.armed ||
      project?.busy ||
      importing.current ||
      loading ||
      state.status === 'loading'
    ) {
      setNotice(
        '녹음·채점·파일 처리를 마친 뒤 파일을 놓아주세요. 현재 작업을 유지했습니다.',
      );
      return;
    }
    try {
      const { kind, file } = droppedLocalMedia(event.dataTransfer);
      void load(kind, async () => file);
    } catch (cause) {
      setError(mediaDropError(cause));
    }
  }
  const fixture = (kind: 'score' | 'audio') =>
    void load(kind, async (signal) => {
      const name = kind === 'score' ? 'standard.musicxml' : 'sine.wav';
      try {
        const response = await fetch(`/fixtures/${name}`, { signal });
        if (!response.ok) throw new Error('LOCAL_FIXTURE_READ_FAILED');
        return new File([await response.blob()], name);
      } catch {
        throw new Error('LOCAL_FIXTURE_READ_FAILED');
      }
    });
  return (
    <div className="workspace">
      <div className="page-heading">
        <h1>{labels[mode]} 작업 공간</h1>
        <span className="badge">
          {project?.details
            ? `프로젝트 · 버전 ${project.details.project.revision}`
            : '로컬 파일 · 미저장'}
        </span>
      </div>
      <p>
        오디오 장치 없이 악보·반주를 재생할 수 있습니다. 단음 입력은 별도로
        시작합니다. 채점 시작을 누르면 선택한 트랙의 단음을 판정합니다. 녹음은
        저장된 프로젝트에서 명시적으로 REC를 눌렀을 때만 기록합니다.
      </p>
      {project?.native && <ProjectStatus project={project} />}
      {!project?.details && (
        <section
          className="panel"
          aria-label="로컬 파일 끌어놓기"
          onDrop={dropMedia}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect =
              importBlocked || loading || state.status === 'loading'
                ? 'none'
                : 'copy';
          }}
        >
          악보 또는 WAV/MP3 파일 한 개를 여기에 놓아 불러오세요. 파일 선택
          버튼도 사용할 수 있습니다.
        </section>
      )}
      {!project?.details && (
        <div className="toolbar">
          {mode === 'copy' && (
            <button
              disabled={loading || importBlocked}
              onClick={() => void load('score', async () => blankScoreFile())}
            >
              빈 악보 만들기
            </button>
          )}
          <label className="button-link">
            악보 선택
            <input
              aria-label="악보 선택"
              type="file"
              accept=".gp,.gp3,.gp4,.gp5,.gpx,.xml,.musicxml,.json"
              disabled={loading || importBlocked}
              onChange={choose('score')}
            />
          </label>
          <label className="button-link">
            음원 선택
            <input
              aria-label="음원 선택"
              type="file"
              accept=".wav,.mp3"
              disabled={loading || importBlocked}
              onChange={choose('audio')}
            />
          </label>
          <button
            disabled={loading || importBlocked}
            onClick={() => fixture('score')}
          >
            자체 악보 불러오기
          </button>
          <button
            disabled={loading || importBlocked}
            onClick={() => fixture('audio')}
          >
            합성 음원 불러오기
          </button>
        </div>
      )}
      {(loading || state.status === 'loading') && (
        <div role="status">
          파일 읽는 중
          <button
            onClick={() => {
              task.current.cancel();
              engine.cancelLoad();
              setLoading(false);
              setNotice('파일 불러오기를 취소했습니다.');
            }}
          >
            취소
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {mode === 'copy' && session && editor && (
        <ScoreEditor
          session={session}
          editor={editor}
          locked={loading || !!project?.busy}
        />
      )}
      {mode === 'copy' && (
        <>
          <StemSeparationPanel project={project} />
          <AiDraftPanel session={session} project={project} editor={editor} />
        </>
      )}
      {mode !== 'copy' && <InputPanel input={input} clock={clock} />}
      {session && (
        <ScoreTrackSelector
          session={session}
          onSelect={(id) => {
            engine.pause();
            setSession(selectScoreTrack(session, id));
          }}
          onRole={(id, role) => {
            engine.pause();
            setSession({
              ...session,
              document: setGuitarRole(session.document, id, role),
            });
          }}
        />
      )}
      {session && (
        <ScoreDisplayControls settings={display} onChange={onDisplayChange} />
      )}
      {session && (
        <ScoreLoopPanel
          key={session.document.id}
          lookup={session.playbackLookup}
          anchors={session.document.syncAnchors}
          locked={playbackLocked || loading || !!project?.busy}
        />
      )}
      <ResizablePanel
        label={mode === 'copy' ? '속성 패널 너비' : '판정 패널 너비'}
        side={
          mode !== 'copy' ? (
            <ScorePanel practice={practice} />
          ) : (
            <Panel title={mode === 'copy' ? '음표 속성' : '연주 상태'}>
              <p>곡: {session?.document.title ?? '선택하지 않음'}</p>
              <p>
                악보 목표:{' '}
                {target ? `MIDI ${target.pitchMidi}` : '다음 음을 준비하세요'}
              </p>
              <p>다음 음: {next ? `MIDI ${next.pitchMidi}` : '없음'}</p>
              <p>녹음 꺼짐</p>
              <p>편집은 상단 수동 음표 패널에서 조작합니다.</p>
            </Panel>
          )
        }
      >
        {session ? (
          <ScoreViewport
            display={display}
            score={session.score}
            lookup={session.playbackLookup}
            trackIndex={track}
            onNavigateNote={
              mode === 'copy' && editor?.enabled && !loading && !project?.busy
                ? editor.moveSelection
                : undefined
            }
            tick={
              mode === 'copy' && editor?.enabled && state.status !== 'playing'
                ? (editor.selectedNote?.startTick ?? tick)
                : tick
            }
            onSelectNote={
              mode === 'copy' && editor?.enabled && !loading && !project?.busy
                ? (note) => {
                    const id = renderedNoteId(session, note, tick);
                    if (id) editor.selectNote(id);
                  }
                : undefined
            }
          />
        ) : (
          <div className="panel">
            악보를 선택하세요. 장치가 없어도 악보를 볼 수 있습니다.
          </div>
        )}
        <Fretboard note={target} />
      </ResizablePanel>
      <p role="status">
        목표 운지:{' '}
        {target
          ? `MIDI ${target.pitchMidi} / ${target.stringIndex ?? '미정'}번 줄 ${target.fret ?? '미정'}프렛`
          : '다음 음을 준비하세요'}{' '}
        · 재생 epoch {state.playbackEpoch}
      </p>
      <section className="panel">
        <h2>수동 싱크 앵커</h2>
        <p>
          음원 ms ↔ 반복을 펼친 악보 tick. 영역 밖은 인접 기울기로 연장합니다.
          수정한 앵커는 앱을 닫기 전까지만 유지됩니다.
        </p>
        {draft.map((anchor, index) => (
          <div className="toolbar" key={index}>
            <label>
              악보 tick
              <input
                type="number"
                min="0"
                value={anchor.scoreTick}
                onChange={(event) =>
                  setDraft(
                    draft.map((a, i) =>
                      i === index
                        ? { ...a, scoreTick: Number(event.target.value) }
                        : a,
                    ),
                  )
                }
              />
            </label>
            <label>
              음원 ms
              <input
                type="number"
                min="0"
                value={anchor.audioTimeMs}
                onChange={(event) =>
                  setDraft(
                    draft.map((a, i) =>
                      i === index
                        ? { ...a, audioTimeMs: Number(event.target.value) }
                        : a,
                    ),
                  )
                }
              />
            </label>
            {draft.length > 2 && (
              <button
                aria-label={`앵커 ${index + 1} 삭제`}
                onClick={() => setDraft(draft.filter((_, i) => i !== index))}
              >
                앵커 삭제
              </button>
            )}
          </div>
        ))}
        <div className="toolbar">
          <button
            disabled={!session}
            onClick={() => {
              const last = draft.at(-1);
              if (last)
                setDraft([
                  ...draft,
                  {
                    scoreTick: last.scoreTick + 3840,
                    audioTimeMs: last.audioTimeMs + 2000,
                  },
                ]);
            }}
          >
            앵커 추가
          </button>
          <button
            disabled={!session}
            onClick={() => {
              if (!session) return;
              try {
                validateAnchors(draft);
                const document = { ...session.document, syncAnchors: draft };
                draft.forEach((a) =>
                  validateTiming(timingAt(document, a.audioTimeMs)),
                );
                engine.pause();
                setSession({ ...session, document });
                setError(null);
              } catch {
                setError(
                  '앵커는 tick·시간이 모두 증가해야 하며 템포는 10~600 BPM 범위여야 합니다.',
                );
              }
            }}
          >
            싱크 적용
          </button>
        </div>
      </section>
    </div>
  );
}
