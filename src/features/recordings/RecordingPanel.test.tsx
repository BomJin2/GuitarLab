import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { importer } from '@coderline/alphatab';
import { RecordingPanel } from './RecordingPanel';
import type { RecordingController } from './useRecording';
import type { ProjectController } from '../library/useProjects';
import type { AudioInputController } from '../practice/useAudioInput';
import type { CalibrationController } from '../settings/useCalibration';
import type { ClockState } from '../player/useCaptureClock';
import type { ScoreSession } from '../score/scoreSession';
import { emptyAudioSnapshot } from '../practice/audioInput';
import { recordingFixture } from '../../test/recordingFixture';
import { normalizeScore, buildPlaybackLookup } from '../score/alphaTabAdapter';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('정렬 REC의 비활성 사유를 표시하고 재생·동기화 후 실제 transport를 전달한다', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:synthetic-readiness'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const take = recordingFixture();
  const score = importer.ScoreLoader.loadAlphaTex('. 0.1.4 3.1.4 5.1.4 7.1.4');
  const lookup = buildPlaybackLookup(score);
  const document = normalizeScore(score, lookup);
  const session: ScoreSession = {
    score,
    playbackLookup: lookup,
    document,
    originalBytes: new Uint8Array(),
    activeTrackIndex: 0,
    savedRevision: {
      projectId: take.projectId,
      revisionId: take.scoreRevisionId,
      document,
    },
  };
  const project: ProjectController = {
    native: true,
    projects: [],
    details: null,
    busy: false,
    listBusy: false,
    trashedProjects: [],
    trashLoaded: false,
    trashListBusy: false,
    trashUsage: null,
    inspectTrashUsage: vi.fn(),
    refreshTrash: vi.fn(async () => undefined),
    trashProject: vi.fn(async () => undefined),
    restoreProject: vi.fn(async () => undefined),
    job: null,
    error: null,
    notice: null,
    importStorage: 'MANAGED',
    setImportStorage: vi.fn(),
    audioAssetId: take.transport?.backingAssetId ?? null,
    scoreSaved: true,
    refresh: vi.fn(),
    open: vi.fn(),
    create: vi.fn(),
    updateMetadata: vi.fn(),
    importAsset: vi.fn(),
    createBlankScore: vi.fn(),
    relink: vi.fn(),
    save: vi.fn(),
    cancel: vi.fn(),
  };
  const input: AudioInputController = {
    native: true,
    state: {
      ...emptyAudioSnapshot,
      ...take.calibration.key,
      state: 'RUNNING',
      streamGeneration: 1,
    },
    devices: [],
    devicesLoaded: true,
    busy: false,
    error: null,
    refresh: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const calibration: CalibrationController = {
    document: { schemaVersion: 1, revision: 1, profiles: [take.calibration] },
    status: 'SAVED',
    error: null,
    load: vi.fn(),
    save: vi.fn(),
    applySaved: vi.fn(),
  };
  const recording: RecordingController = {
    preparing: false,
    startPrepared: vi.fn(),
    cancelPreparation: vi.fn(),
    take: null,
    busy: false,
    locked: false,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
  };
  const clock: ClockState = {
    status: 'READY',
    roundTripMs: 2,
    anchorCount: 8,
    maximumResidualRealMs: 1,
  };
  const engine = new PlayerEngine();
  engine.load(new Blob(['synthetic-backing']));
  Object.defineProperty(engine.audio, 'duration', {
    configurable: true,
    value: 4,
  });
  engine.audio.dispatchEvent(new Event('loadedmetadata'));
  const view = (nextProject = project, nextClock = clock, mixReady = true) => (
    <Context.Provider value={engine}>
      <RecordingPanel
        recording={recording}
        project={nextProject}
        session={session}
        input={input}
        calibration={calibration}
        clock={nextClock}
        enabled
        referenceTakeIds={[take.id]}
        mixReady={mixReady}
      />
    </Context.Provider>
  );
  const { rerender } = render(view());
  const rec = () => screen.getByRole('button', { name: '● REC' });
  expect(rec().hasAttribute('disabled')).toBe(false);
  expect(screen.getByText(/3초 준비 후 녹음과 반주/)).toBeTruthy();
  fireEvent.click(rec());
  expect(recording.startPrepared).toHaveBeenCalledWith(
    expect.objectContaining({
      source: 'INPUT_ONLY',
      referenceTakeIds: [take.id],
    }),
  );
  expect(recording.start).not.toHaveBeenCalled();
  await act(async () => {
    await engine.play();
  });
  expect(rec().hasAttribute('disabled')).toBe(false);
  fireEvent.click(rec());
  expect(recording.start).toHaveBeenCalledWith(
    expect.objectContaining({
      source: 'INPUT_ONLY',
      referenceTakeIds: [take.id],
      transport: {
        playbackEpoch: engine.getSnapshot().playbackEpoch,
        rate: 1,
        backingAssetId: project.audioAssetId,
      },
    }),
  );
  rerender(view(project, clock, false));
  expect(rec().hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/믹스를 먼저 준비/)).toBeTruthy();
  rerender(view(project, { ...clock, status: 'WARMING' }));
  expect(rec().hasAttribute('disabled')).toBe(false);
  fireEvent.click(rec());
  expect(recording.start).toHaveBeenLastCalledWith(
    expect.objectContaining({ deferTransport: true }),
  );
  rerender(view({ ...project, audioAssetId: null }));
  expect(rec().hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/프로젝트 음원 선택으로 반주를 연결/)).toBeTruthy();
  rerender(view());
  act(() => engine.setLoop({ startMs: 0, endMs: 1000 }));
  expect(rec().hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/반복을 끈 뒤 로컬 반주를 재생/)).toBeTruthy();
  act(() => engine.pause());
  fireEvent.click(screen.getByLabelText('로컬 반주에 정렬'));
  expect(rec().hasAttribute('disabled')).toBe(false);
  fireEvent.click(rec());
  expect(recording.start).toHaveBeenLastCalledWith(
    expect.objectContaining({ source: 'INPUT_ONLY', transport: null }),
  );
  expect(
    vi.mocked(recording.start).mock.calls.at(-1)?.[0].referenceTakeIds,
  ).toBeUndefined();
  const starts = vi.mocked(recording.start).mock.calls.length;
  recording.take = { ...take, peak: 0.9996 };
  rerender(view());
  expect(screen.getByText(/peak 1\.000/)).toBeTruthy();
  expect(screen.queryByText(/녹음 입력이 디지털 최대값/)).toBeNull();
  recording.take = { ...take, state: 'RECORDING', peak: 1 };
  recording.locked = true;
  rerender(view());
  expect(screen.getByText(/인터페이스의 입력 GAIN/)).toBeTruthy();
  recording.take = { ...take, peak: 1.2 };
  recording.locked = false;
  rerender(view());
  expect(screen.getByText(/최대값만으로 실제/)).toBeTruthy();
  expect(vi.mocked(recording.start).mock.calls.length).toBe(starts);
  expect(recording.stop).not.toHaveBeenCalled();
  recording.take = null;
  rerender(view());
  expect(screen.queryByText(/녹음 입력이 디지털 최대값/)).toBeNull();
  engine.dispose();
});
