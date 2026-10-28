import { ScoreWorkspace } from '../features/score/ScoreWorkspace';
import {
  defaultScoreDisplay,
  type ScoreDisplaySettings,
} from '../features/score/scoreDisplay';
import { useEffect, useState } from 'react';
import { LibraryPage } from '../features/library/LibraryPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import type { ScoreSession } from '../features/score/scoreSession';
import { ResultsPage } from '../features/practice/ResultsPage';
import { BackingPage } from '../features/backing/BackingPage';
import { AppShell } from './AppShell';
import { labels, useRoute } from './routes';
import { useAudioInput } from '../features/practice/useAudioInput';
import { useCaptureClock } from '../features/player/useCaptureClock';
import { useCalibration } from '../features/settings/useCalibration';
import { useCalibrationMeasurement } from '../features/settings/useCalibrationMeasurement';
import { usePractice } from '../features/practice/usePractice';
import { useProjects } from '../features/library/useProjects';
import { useRecording } from '../features/recordings/useRecording';
import { RecordingPanel } from '../features/recordings/RecordingPanel';
import { RecordingsPage } from '../features/recordings/RecordingsPage';
import { InputMonitor } from '../features/practice/InputMonitor';
import { useProjectMix } from '../features/performance/useProjectMix';
import { MixPanel } from '../features/performance/MixPanel';
import { ImportedStemsPanel } from '../features/performance/ImportedStemsPanel';
import { PreparationCountdown } from '../features/player/PreparationCountdown';
import { usePlayer } from '../features/player/usePlayer';
import { useScoreEditing } from '../features/score/useScoreEditing';
import { useCloseGuard } from './useCloseGuard';
import { useScoreAutosave } from '../features/library/useScoreAutosave';
import { ScoreAutosave } from '../features/library/ScoreAutosave';
import { isTextEntryTarget } from '../shared/keyboard';
import { ProjectFileDrop } from '../features/library/ProjectFileDrop';
export function App() {
  const player = usePlayer();
  const route = useRoute();
  const input = useAudioInput();
  const calibration = useCalibration(input.native);
  const measurement = useCalibrationMeasurement(input, calibration);
  const { active: measurementActive, cancel: cancelMeasurement } = measurement;
  const clock = useCaptureClock(input.state, input.native, !measurement.active);
  const [session, setSession] = useState<ScoreSession | null>(null);
  const [scoreDisplay, setScoreDisplay] =
    useState<ScoreDisplaySettings>(defaultScoreDisplay);
  const closeGuard = useCloseGuard(session);
  const project = useProjects(
    session,
    setSession,
    closeGuard.confirmReplacement,
  );
  const recording = useRecording(input.native);
  const editor = useScoreEditing(
    session,
    setSession,
    recording.locked || project.busy,
  );
  const mixEnabled =
    (route === 'performance' || route === 'practice' || recording.locked) &&
    !measurement.active;
  const mix = useProjectMix(
    project.native ? project.details?.project.id : undefined,
    project.audioAssetId,
    session?.savedRevision?.revisionId,
    mixEnabled,
  );
  const practice = usePractice(
    session,
    input,
    clock,
    calibration,
    (route === 'practice' || route === 'performance') && !measurement.active,
    project.scoreSaved ? session?.savedRevision : undefined,
  );
  const autosave = useScoreAutosave(
    project,
    session,
    recording.locked || measurement.active || practice.armed,
  );
  const [help, setHelp] = useState(false);
  useEffect(() => {
    if (route !== 'settings' && measurementActive) void cancelMeasurement();
  }, [route, measurementActive, cancelMeasurement]);
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        isTextEntryTarget(event.target)
      )
        return;
      if (event.key === 'Escape') setHelp(false);
      if (event.key === '?') setHelp(true);
      if (event.altKey && ['1', '2', '3'].includes(event.key)) {
        event.preventDefault();
        if (recording.locked) return;
        window.location.hash = `#/${event.key === '1' ? 'copy' : event.key === '2' ? 'practice' : 'performance'}`;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [recording.locked]);
  useEffect(() => {
    document.title = `GuitarLab · ${route ? labels[route] : '페이지 없음'}`;
  }, [route]);
  return (
    <ProjectFileDrop
      contextKey={`${project.details?.project.id ?? 'none'}:${route}`}
      active={
        project.native &&
        !!project.details &&
        (route === 'library' ||
          route === 'copy' ||
          route === 'practice' ||
          route === 'performance')
      }
      disabled={
        recording.locked ||
        project.busy ||
        practice.armed ||
        measurement.active ||
        player.state.status === 'loading'
      }
      reference={project.importStorage === 'REFERENCE'}
      onFile={(kind, file) =>
        project.importAsset(
          kind === 'score' ? 'SCORE_IMPORT' : 'ORIGINAL',
          project.importStorage,
          file,
        )
      }
    >
      <AppShell
        route={route}
        inputState={input.state.state}
        projectTitle={project.details?.project.title}
        scoreSaved={project.scoreSaved}
        recordingLocked={recording.locked}
      >
        {closeGuard.notice && (
          <section role="alert" className="panel">
            <p>{closeGuard.notice}</p>
            <button onClick={closeGuard.dismiss}>안내 닫기</button>
          </section>
        )}
        <button
          className="help-trigger"
          onClick={() => setHelp(!help)}
          aria-expanded={help}
        >
          단축키 안내
        </button>
        <ScoreAutosave controller={autosave} />
        {help && (
          <section className="panel" aria-label="단축키 안내">
            <h2>키보드 조작</h2>
            <p>
              Alt+1 카피 / Alt+2 연습 / Alt+3 연주 · ? 안내 열기 · Esc 안내 닫기
            </p>
            <p>
              Tab으로 컨트롤 탐색, 패널 구분선의 좌우 화살표로 너비 조절. Space
              재생/일시정지 · 좌우 5초 탐색 · R 반복 전환. 입력 중에는 단축키를
              사용하지 않습니다.
            </p>
            <button onClick={() => setHelp(false)}>안내 닫기</button>
          </section>
        )}
        {(route === 'performance' ||
          route === 'practice' ||
          recording.locked ||
          recording.error) && (
          <RecordingPanel
            recording={recording}
            project={project}
            session={session}
            input={input}
            calibration={calibration}
            clock={clock}
            enabled={
              (route === 'performance' || route === 'practice') &&
              !measurement.active
            }
            referenceTakeIds={mix.referenceTakeIds}
            mixBusy={mix.busy}
            mixReady={!mix.needsPreparation}
          />
        )}
        {mixEnabled && (
          <ImportedStemsPanel
            key={`imported-stems:${project.details?.project.id ?? 'unbound'}`}
            projectId={project.native ? project.details?.project.id : undefined}
            locked={recording.locked || project.busy}
          />
        )}
        {mixEnabled && (
          <MixPanel
            key={`mix:${project.details?.project.id ?? 'unbound'}`}
            controller={mix}
            locked={recording.locked}
          />
        )}
        <InputMonitor
          input={input}
          startBlocked={measurement.active && measurement.mode === 'CABLE'}
        />
        {player.state.status === 'countIn' && (
          <PreparationCountdown
            key={player.state.playbackEpoch}
            remainingMs={player.state.countInRemainingMs}
            onCancel={() =>
              recording.preparing
                ? recording.cancelPreparation()
                : player.engine.pause()
            }
          />
        )}
        <div inert={recording.locked}>
          {route === null ? (
            <section>
              <h1>페이지를 찾을 수 없습니다</h1>
              <a href="#/library">라이브러리로 돌아가기</a>
            </section>
          ) : route === 'library' ? (
            <LibraryPage project={project} />
          ) : route === 'settings' ? (
            <SettingsPage
              input={input}
              clock={clock}
              calibration={calibration}
              measurement={measurement}
            />
          ) : route === 'copy' ||
            route === 'practice' ||
            route === 'performance' ? (
            <ScoreWorkspace
              playbackLocked={recording.locked}
              display={scoreDisplay}
              onDisplayChange={setScoreDisplay}
              session={session}
              setSession={setSession}
              mode={route}
              input={input}
              clock={clock}
              practice={practice}
              project={project}
              editor={editor}
              beforeReplace={closeGuard.confirmReplacement}
            />
          ) : route === 'results' ? (
            <ResultsPage project={project} />
          ) : route === 'recordings' ? (
            <RecordingsPage project={project} />
          ) : (
            <BackingPage
              key={project.details?.project.id ?? 'unbound'}
              locked={recording.locked}
              projectId={
                project.native ? project.details?.project.id : undefined
              }
              projectTitle={project.details?.project.title}
              scoreSession={session}
              scoreSaved={project.scoreSaved}
            />
          )}
        </div>
      </AppShell>
    </ProjectFileDrop>
  );
}
