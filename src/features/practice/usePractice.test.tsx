import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import xml from '../../../public/fixtures/standard.musicxml?raw';
import {
  importScore,
  normalizeScore,
  buildPlaybackLookup,
} from '../score/alphaTabAdapter';
import type { ScoreSession } from '../score/scoreSession';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import { emptyAudioSnapshot } from './audioInput';
import type { AudioInputController } from './useAudioInput';
import type { CalibrationController } from '../settings/useCalibration';
import type { ClockState } from '../player/useCaptureClock';
import { practiceFixture } from '../../test/practiceFixture';
import { practiceApi, type AttemptSnapshot } from './practice';
import { usePractice } from './usePractice';
import { dualGuitarSession } from '../../test/dualGuitarFixture';
import { selectScoreTrack } from '../score/trackSelection';
import { editNote } from '../score/scoreEditing';
import { renderNormalized } from '../score/normalizedNotation';
vi.mock('./practice', async (original) => ({
  ...(await original<typeof import('./practice')>()),
  practiceApi: { start: vi.fn(), poll: vi.fn(), stop: vi.fn() },
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(async () => {
  cleanup();
  await act(async () => {});
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function harness() {
  const engine = new PlayerEngine();
  let playback = {
    performanceTimeMs: 1000,
    songTimeMs: 1000,
    rate: 1,
    playbackEpoch: 2,
    playing: true,
  };
  vi.spyOn(engine, 'readClock').mockImplementation(() => playback);
  vi.spyOn(engine, 'getSnapshot').mockReturnValue({
    ...engine.getSnapshot(),
    durationMs: 10000,
    status: 'playing',
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Context.Provider value={engine}>{children}</Context.Provider>
  );
  const score = importScore(new TextEncoder().encode(xml));
  const playbackLookup = buildPlaybackLookup(score);
  const session: ScoreSession = {
    score,
    playbackLookup,
    document: normalizeScore(score, playbackLookup),
    activeTrackIndex: 0,
    originalBytes: new TextEncoder().encode(xml),
  };
  const snapshot = practiceFixture();
  const input: AudioInputController = {
    native: true,
    state: {
      ...emptyAudioSnapshot,
      state: 'RUNNING',
      streamGeneration: 1,
      deviceId: 'fixture',
      sampleRate: 48000,
      sampleFormat: 'f32',
      channels: 1,
      channelIndex: 0,
      bufferFrames: 480,
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
    document: {
      schemaVersion: 1,
      revision: 1,
      profiles: [snapshot.calibrationProfile],
    },
    status: 'IDLE',
    error: null,
    load: vi.fn(),
    save: vi.fn(),
    applySaved: vi.fn(),
  };
  const clock: ClockState = {
    status: 'READY',
    roundTripMs: 2,
    anchorCount: 3,
    maximumResidualRealMs: 1,
  };
  vi.mocked(practiceApi.start).mockResolvedValue(snapshot);
  vi.mocked(practiceApi.poll).mockResolvedValue(snapshot);
  vi.mocked(practiceApi.stop).mockResolvedValue({
    ...snapshot,
    state: 'STOPPED',
    excluded: 2,
  });
  return {
    engine,
    wrapper,
    session,
    input,
    calibration,
    clock,
    setPlayback: (values: Partial<typeof playback>) => {
      playback = { ...playback, ...values };
    },
  };
}
async function advance(ms = 210) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
it('편집한 렌더와 음정/시각을 새 채점 revision에 전달하고 Undo는 이전 목표로 분리한다', async () => {
  const fixture = harness();
  const track = fixture.session.document.tracks[0];
  const note = track?.notes[0];
  if (!track || !note) throw new Error('테스트 음표 필요');
  const { result, rerender } = renderHook(
    ({ session }) =>
      usePractice(
        session,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
      ),
    { wrapper: fixture.wrapper, initialProps: { session: fixture.session } },
  );
  act(() => result.current.start());
  await advance();
  const originalRequest = vi.mocked(practiceApi.start).mock.calls[0]?.[0];
  expect(originalRequest?.targets.find((t) => t.id === note.id)).toEqual({
    id: note.id,
    pitchMidi: 64,
    songTimeMs: 0,
  });
  const document = editNote(fixture.session.document, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: { startTick: 480, durationTicks: 480, stringIndex: 1, fret: 1 },
  });
  const rendered = renderNormalized(document);
  const roundtrip = normalizeScore(rendered.score, rendered.playbackLookup);
  expect(roundtrip.tracks[0]?.notes[0]).toMatchObject({
    pitchMidi: 65,
    startTick: 480,
    durationTicks: 480,
    fret: 1,
  });
  rerender({ session: { ...fixture.session, ...rendered, document } });
  await advance();
  const editedRequest = vi.mocked(practiceApi.start).mock.lastCall?.[0];
  expect(editedRequest?.targets.find((t) => t.id === note.id)).toEqual({
    id: note.id,
    pitchMidi: 65,
    songTimeMs: 250,
  });
  expect(editedRequest?.scoreRevision).not.toBe(originalRequest?.scoreRevision);
  expect(practiceApi.stop).toHaveBeenCalledTimes(1);
  rerender({ session: fixture.session });
  await advance();
  expect(
    vi
      .mocked(practiceApi.start)
      .mock.lastCall?.[0].targets.find((t) => t.id === note.id),
  ).toEqual({ id: note.id, pitchMidi: 64, songTimeMs: 0 });
  expect(practiceApi.stop).toHaveBeenCalledTimes(2);
});
it('명시적 시작 없이 채점하지 않으며 서버 결과만 표시한다', async () => {
  const fixture = harness();
  const { result } = renderHook(
    () =>
      usePractice(
        fixture.session,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
      ),
    { wrapper: fixture.wrapper },
  );
  await advance();
  expect(practiceApi.start).not.toHaveBeenCalled();
  act(() => result.current.start());
  await advance();
  expect(result.current.snapshot?.score).toBe(1000);
  expect(practiceApi.start).toHaveBeenCalledWith(
    expect.objectContaining({
      calibrationProfileId: practiceFixture().calibrationProfile.id,
      calibrationRevision: 1,
      playbackEpoch: 2,
      rate: 1,
      trackId: fixture.session.document.tracks[0]?.id,
    }),
  );
  expect(practiceApi.start).not.toHaveBeenCalledWith(
    expect.objectContaining({
      biasRealMs: expect.anything(),
      onsets: expect.anything(),
    }),
  );
});
it('일시정지·seek·배속·loop epoch 전환마다 이전 시도를 종료한다', async () => {
  const fixture = harness();
  const { result } = renderHook(
    () =>
      usePractice(
        fixture.session,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
      ),
    { wrapper: fixture.wrapper },
  );
  act(() => result.current.start());
  await advance();
  fixture.setPlayback({ playing: false });
  await advance();
  expect(practiceApi.stop).toHaveBeenCalledTimes(1);
  expect(result.current.history).toHaveLength(1);
  for (const [epoch, rate] of [
    [3, 1],
    [4, 0.75],
    [5, 0.75],
  ]) {
    fixture.setPlayback({ playbackEpoch: epoch, rate, playing: true });
    await advance();
    expect(practiceApi.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ playbackEpoch: epoch, rate }),
    );
  }
  expect(practiceApi.stop).toHaveBeenCalledTimes(3);
});
it('보정 revision 변경과 화면 이탈은 이전 시도와 분리한다', async () => {
  const fixture = harness();
  const { result, rerender } = renderHook(
    ({ enabled, calibration }) =>
      usePractice(
        fixture.session,
        fixture.input,
        fixture.clock,
        calibration,
        enabled,
      ),
    {
      wrapper: fixture.wrapper,
      initialProps: { enabled: true, calibration: fixture.calibration },
    },
  );
  act(() => result.current.start());
  await advance();
  rerender({
    enabled: true,
    calibration: {
      ...fixture.calibration,
      document: { ...fixture.calibration.document, revision: 2 },
    },
  });
  await advance();
  expect(practiceApi.stop).toHaveBeenCalledTimes(1);
  expect(practiceApi.start).toHaveBeenLastCalledWith(
    expect.objectContaining({ calibrationRevision: 2 }),
  );
  rerender({ enabled: false, calibration: fixture.calibration });
  await advance();
  expect(practiceApi.stop).toHaveBeenCalledTimes(2);
});
it('시작 응답이 늦게 와도 중단한 시도를 재활성화하지 않는다', async () => {
  const fixture = harness();
  let resolve: (value: AttemptSnapshot) => void = () => undefined;
  vi.mocked(practiceApi.start).mockImplementation(
    () =>
      new Promise((ok) => {
        resolve = ok;
      }),
  );
  const { result } = renderHook(
    () =>
      usePractice(
        fixture.session,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
      ),
    { wrapper: fixture.wrapper },
  );
  act(() => result.current.start());
  await advance();
  act(() => result.current.stop());
  await act(async () => {
    resolve(practiceFixture());
  });
  expect(practiceApi.stop).toHaveBeenCalledTimes(1);
  expect(practiceApi.poll).not.toHaveBeenCalled();
  expect(result.current.armed).toBe(false);
});
it('완료 시도는 같은 epoch에서 재시작하지 않으며 명시적 새 시작은 허용한다', async () => {
  const fixture = harness();
  vi.mocked(practiceApi.poll).mockResolvedValue({
    ...practiceFixture(),
    state: 'FINISHED',
    excluded: 2,
  });
  const { result } = renderHook(
    () =>
      usePractice(
        fixture.session,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
      ),
    { wrapper: fixture.wrapper },
  );
  act(() => result.current.start());
  await advance(1000);
  expect(practiceApi.start).toHaveBeenCalledTimes(1);
  expect(result.current.history).toHaveLength(1);
  act(() => result.current.stop());
  act(() => result.current.start());
  await advance();
  expect(practiceApi.start).toHaveBeenCalledTimes(2);
});
it('clock 손실과 입력 중단 구간에는 새 채점을 시작하지 않는다', async () => {
  const fixture = harness();
  const { result, rerender } = renderHook(
    ({ input, clock }) =>
      usePractice(fixture.session, input, clock, fixture.calibration, true),
    {
      wrapper: fixture.wrapper,
      initialProps: { input: fixture.input, clock: fixture.clock },
    },
  );
  act(() => result.current.start());
  await advance();
  rerender({
    input: fixture.input,
    clock: { ...fixture.clock, status: 'UNCERTAIN' },
  });
  await advance(600);
  expect(practiceApi.stop).toHaveBeenCalledTimes(1);
  expect(practiceApi.start).toHaveBeenCalledTimes(1);
  rerender({
    input: {
      ...fixture.input,
      state: { ...fixture.input.state, state: 'STOPPED' },
    },
    clock: fixture.clock,
  });
  await advance();
  expect(practiceApi.start).toHaveBeenCalledTimes(1);
});
it('마운트 해제 뒤 늦게 생성된 native 시도도 종료한다', async () => {
  const fixture = harness();
  let resolve: (value: AttemptSnapshot) => void = () => undefined;
  vi.mocked(practiceApi.start).mockImplementation(
    () =>
      new Promise((ok) => {
        resolve = ok;
      }),
  );
  const { result, unmount } = renderHook(
    () =>
      usePractice(
        fixture.session,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
      ),
    { wrapper: fixture.wrapper },
  );
  act(() => result.current.start());
  await advance();
  unmount();
  await act(async () => {
    resolve(practiceFixture());
  });
  expect(practiceApi.stop).toHaveBeenCalledTimes(1);
  expect(practiceApi.poll).not.toHaveBeenCalled();
});
it('중지 요청이 일시 실패하면 같은 ID를 재시도한 뒤에만 새 epoch를 시작한다', async () => {
  const fixture = harness();
  const { result } = renderHook(
    () =>
      usePractice(
        fixture.session,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
      ),
    { wrapper: fixture.wrapper },
  );
  act(() => result.current.start());
  await advance();
  vi.mocked(practiceApi.stop).mockRejectedValueOnce(new Error('일시 IPC 오류'));
  fixture.setPlayback({ playbackEpoch: 3 });
  await advance();
  expect(practiceApi.start).toHaveBeenCalledTimes(1);
  await advance();
  expect(practiceApi.stop).toHaveBeenCalledTimes(2);
  expect(practiceApi.stop).toHaveBeenNthCalledWith(
    2,
    practiceFixture().attemptId,
  );
  expect(practiceApi.start).toHaveBeenCalledTimes(2);
});
it('저장한 악보만 영속 revision과 session을 연결하고 seek에도 같은 세션을 유지한다', async () => {
  const fixture = harness();
  const saved = {
    projectId: practiceFixture().attemptId,
    revisionId: practiceFixture().scoreRevision,
    document: fixture.session.document,
  };
  const { result } = renderHook(
    () =>
      usePractice(
        fixture.session,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
        saved,
      ),
    { wrapper: fixture.wrapper },
  );
  act(() => result.current.start());
  await advance();
  const first = vi.mocked(practiceApi.start).mock.calls[0]?.[0];
  if (!first?.archive) throw new Error('저장 요청 없음');
  expect(result.current.persistent).toBe(true);
  expect(first.scoreRevision).toBe(saved.revisionId);
  expect(first.archive).toMatchObject({
    projectId: saved.projectId,
    rangeStartMs: 0,
    rangeEndMs: 10000,
  });
  fixture.setPlayback({ playbackEpoch: 3 });
  await advance();
  expect(
    vi.mocked(practiceApi.start).mock.calls[1]?.[0].archive?.sessionId,
  ).toBe(first.archive.sessionId);
});
it('저장 뒤 변경한 악보는 이전 영속 revision에 기록하지 않고 메모리 모드로 처리한다', async () => {
  const fixture = harness();
  const saved = {
    projectId: practiceFixture().attemptId,
    revisionId: practiceFixture().scoreRevision,
    document: fixture.session.document,
  };
  const changed = {
    ...fixture.session,
    document: {
      ...fixture.session.document,
      syncAnchors: fixture.session.document.syncAnchors.map((a) => ({
        ...a,
        audioTimeMs: a.audioTimeMs + 100,
      })),
    },
  };
  const { result } = renderHook(
    () =>
      usePractice(
        changed,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
        saved,
      ),
    { wrapper: fixture.wrapper },
  );
  act(() => result.current.start());
  await advance();
  const request = vi.mocked(practiceApi.start).mock.calls[0]?.[0];
  expect(request?.archive).toBeUndefined();
  expect(request?.scoreRevision).not.toBe(saved.revisionId);
  expect(result.current.persistent).toBe(false);
});

it('기타 전환은 이전 시도 중지 완료 뒤 선택 트랙만 새 세션으로 전달한다', async () => {
  const fixture = harness();
  const session = dualGuitarSession();
  const second = session.document.tracks[1];
  if (!second) throw new Error('두 번째 기타 없음');
  const saved = {
    projectId: practiceFixture().attemptId,
    revisionId: practiceFixture().scoreRevision,
    document: session.document,
  };
  const { result, rerender } = renderHook(
    ({ selected }: { selected: ScoreSession }) =>
      usePractice(
        selected,
        fixture.input,
        fixture.clock,
        fixture.calibration,
        true,
        saved,
      ),
    { wrapper: fixture.wrapper, initialProps: { selected: session } },
  );
  act(() => result.current.start());
  await advance();
  const first = vi.mocked(practiceApi.start).mock.calls[0]?.[0];
  if (!first) throw new Error('첫 요청 없음');
  expect(first.targets.map((note) => note.pitchMidi)).toEqual([
    64, 67, 69, 71, 64, 67, 69, 71,
  ]);
  let finishStop: ((value: AttemptSnapshot) => void) | undefined;
  vi.mocked(practiceApi.stop).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishStop = resolve;
      }),
  );
  rerender({ selected: selectScoreTrack(session, second.id) });
  await advance();
  expect(practiceApi.stop).toHaveBeenCalledTimes(1);
  expect(practiceApi.start).toHaveBeenCalledTimes(1);
  if (!finishStop) throw new Error('중지 요청 없음');
  await act(async () => {
    finishStop?.({ ...practiceFixture(), state: 'STOPPED' });
  });
  await advance();
  const next = vi.mocked(practiceApi.start).mock.calls[1]?.[0];
  expect(next?.trackId).toBe(second.id);
  expect(next?.targets.map((note) => note.pitchMidi)).toEqual([
    40, 45, 50, 55, 40, 45, 50, 55,
  ]);
  expect(next?.archive?.sessionId).not.toBe(first.archive?.sessionId);
});
