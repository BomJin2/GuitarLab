import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Context } from '../player/playerContextValue';
import { PlayerEngine } from '../player/PlayerEngine';
import {
  recordingFixture,
  recordingWaveFixture,
} from '../../test/recordingFixture';
import { recordingApi } from './recordings';
import { TakeReplay } from './TakeReplay';
import { exporter, importer } from '@coderline/alphatab';
import { normalizeScore } from '../score/alphaTabAdapter';
import { projectApi } from '../library/projects';
import { projectFixture } from '../../test/projectFixture';
import type { model } from '@coderline/alphatab';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { editNote } from '../score/scoreEditing';

vi.mock('../score/ScoreViewport', () => ({
  ScoreViewport: ({ tick, score }: { tick: number; score: model.Score }) => (
    <>
      <output aria-label="리플레이 커서 tick">{tick}</output>
      <output aria-label="리플레이 첫 프렛">
        {
          score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0]
            ?.fret
        }
      </output>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function preparePlayback() {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:synthetic-recording'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(recordingApi, 'read').mockResolvedValue(recordingWaveFixture());
  const main = new PlayerEngine();
  main.load(new Blob(['original-backing']));
  const originalMedia = main.audio;
  const replays = new Set<PlayerEngine>();
  const load = PlayerEngine.prototype.load;
  vi.spyOn(PlayerEngine.prototype, 'load').mockImplementation(function (
    this: PlayerEngine,
    blob: Blob,
  ) {
    load.call(this, blob);
    replays.add(this);
    Object.defineProperty(this.audio, 'duration', {
      value: 4,
      configurable: true,
    });
    this.audio.dispatchEvent(new Event('loadedmetadata'));
  });
  return { main, originalMedia, replays };
}
it('이름·메모를 저장해도 WAV를 다시 읽거나 재생 위치·상태를 초기화하지 않는다', async () => {
  const { main, originalMedia, replays } = preparePlayback();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(recordingApi, 'revision').mockRejectedValue(
    new Error('REVISION_NOT_FOUND'),
  );
  const take = recordingFixture();
  const view = (value: typeof take) => (
    <Context.Provider value={main}>
      <TakeReplay take={value} peer={null} />
    </Context.Provider>
  );
  const { rerender } = render(view(take));
  await act(async () => {});
  const engine = [...replays][0];
  if (!engine) throw new Error('리플레이 엔진 필요');
  act(() => engine.seek(1000));
  await act(async () => {
    await engine.play();
  });
  const media = engine.audio;
  const epoch = engine.getSnapshot().playbackEpoch;
  rerender(view({ ...take, name: '저장한 이름', memo: '연습 메모' }));
  await act(async () => {});
  expect(
    screen.getByRole('heading', { name: '저장한 이름 다시 듣기' }),
  ).toBeTruthy();
  expect(recordingApi.read).toHaveBeenCalledTimes(1);
  expect(engine.audio).toBe(media);
  expect(engine.getSnapshot().status).toBe('playing');
  expect(engine.getSnapshot().audioTimeMs).toBe(1000);
  expect(engine.getSnapshot().playbackEpoch).toBe(epoch);
  expect(main.audio).toBe(originalMedia);
});
it('정렬 offset만 바꾸면 파일 위치를 유지하고 A/B는 새 악보 시간을 사용한다', async () => {
  const { main, replays } = preparePlayback();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(recordingApi, 'revision').mockRejectedValue(
    new Error('REVISION_NOT_FOUND'),
  );
  const a = recordingFixture(),
    b = recordingFixture({ id: crypto.randomUUID(), songStartMs: 1200 });
  const view = (value: typeof a) => (
    <Context.Provider value={main}>
      <TakeReplay take={value} peer={null} />
    </Context.Provider>
  );
  const { rerender } = render(view(a));
  await act(async () => {});
  const engine = [...replays][0];
  if (!engine) throw new Error('리플레이 엔진 필요');
  act(() => engine.seek(1000));
  rerender(view({ ...a, alignmentOffsetMs: 40 }));
  await act(async () => {});
  expect(recordingApi.read).toHaveBeenCalledTimes(1);
  expect(engine.getSnapshot().audioTimeMs).toBe(1000);
  expect(screen.getByText(/악보 1540.0ms/)).toBeTruthy();
  rerender(view(b));
  await act(async () => {});
  expect(engine.getSnapshot().audioTimeMs).toBe(700);
});
it('같은 테이크의 내용 지문 변경과 명시적 다시 읽기는 파일을 새로 읽는다', async () => {
  const { main } = preparePlayback();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(recordingApi, 'revision').mockRejectedValue(
    new Error('REVISION_NOT_FOUND'),
  );
  const take = recordingFixture();
  const view = (value: typeof take) => (
    <Context.Provider value={main}>
      <TakeReplay take={value} peer={null} />
    </Context.Provider>
  );
  const { rerender } = render(view(take));
  await act(async () => {});
  rerender(view({ ...take, sha256: 'b'.repeat(64) }));
  await act(async () => {});
  expect(recordingApi.read).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: '녹음 다시 불러오기' }));
  await act(async () => {});
  expect(recordingApi.read).toHaveBeenCalledTimes(3);
});
it('파일을 읽는 중 이름이 갱신돼도 현재 읽기를 취소하거나 중복 요청하지 않는다', async () => {
  const { main } = preparePlayback();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(recordingApi, 'revision').mockRejectedValue(
    new Error('REVISION_NOT_FOUND'),
  );
  let finish!: (value: ArrayBuffer) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(recordingApi.read).mockImplementation(
    (_projectId, _takeId, current) => {
      signal = current;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  const take = recordingFixture();
  const view = (value: typeof take) => (
    <Context.Provider value={main}>
      <TakeReplay take={value} peer={null} />
    </Context.Provider>
  );
  const { rerender } = render(view(take));
  rerender(view({ ...take, name: '읽는 중 바꾼 이름' }));
  expect(signal?.aborted).toBe(false);
  expect(recordingApi.read).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(recordingWaveFixture());
  });
  expect(
    screen.getByRole('heading', { name: '읽는 중 바꾼 이름 다시 듣기' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: '테이크 재생' })).toHaveProperty(
    'disabled',
    false,
  );
});
it('녹음 당시 편집 리비전을 원본과 분리해 실제 파생 음표로 렌더한다', async () => {
  const { main } = preparePlayback();
  const initial = scoreEditingFixture();
  const track = initial.document.tracks[0];
  const note = track?.notes[0];
  const revision = projectFixture().revision;
  if (!track || !note || !revision) throw new Error('테스트 리비전 필요');
  const document = editNote(initial.document, {
    kind: 'UPDATE',
    trackId: track.id,
    noteId: note.id,
    value: { startTick: 0, durationTicks: 960, stringIndex: 1, fret: 5 },
  });
  const take = recordingFixture({ targetScoreTrackId: track.id });
  vi.spyOn(recordingApi, 'revision').mockResolvedValue({
    ...revision,
    projectId: take.projectId,
    revisionId: take.scoreRevisionId,
    score: document,
  });
  vi.spyOn(projectApi, 'read').mockResolvedValue({
    name: 'original.musicxml',
    data: new Uint8Array(initial.originalBytes).buffer,
  });
  render(
    <Context.Provider value={main}>
      <TakeReplay take={take} peer={null} />
    </Context.Provider>,
  );
  await act(async () => {});
  expect(screen.getByLabelText('리플레이 첫 프렛').textContent).toBe('5');
  expect(screen.queryByText(/TAB 표시는 생략/)).toBeNull();
});
it('원곡과 원본을 유지하며 재생 음량·음소거·A/B 음량 맞춤·악보 시각·부분 반복을 적용한다', async () => {
  const { main, originalMedia, replays } = preparePlayback();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(recordingApi, 'revision').mockRejectedValue(
    new Error('REVISION_NOT_FOUND'),
  );
  const a = recordingFixture({ peak: 1 });
  const b = recordingFixture({
    id: '00000000-0000-4000-8000-000000000009',
    songStartMs: 1200,
    peak: 0.25,
  });
  const { rerender } = render(
    <Context.Provider value={main}>
      <TakeReplay take={a} peer={b} />
    </Context.Provider>,
  );
  await act(async () => {});
  expect(screen.getByText(/TAB 표시는 생략/)).toBeTruthy();
  expect(screen.getByRole('img', { name: '실제 녹음 파형' })).toBeTruthy();
  expect(main.audio).toBe(originalMedia);
  const engine = [...replays][0];
  expect(engine).not.toBe(main);
  if (!engine) throw new Error('테스트 replay 필요');
  act(() => engine.seek(1000));
  const position = engine.getSnapshot().audioTimeMs;
  const epoch = engine.getSnapshot().playbackEpoch;
  const media = engine.audio;
  fireEvent.change(screen.getByRole('slider', { name: '테이크 재생 음량' }), {
    target: { value: '40' },
  });
  expect(engine.audio.volume).toBeCloseTo(0.1);
  expect(screen.getByText(/녹음 입력이 디지털 최대값/)).toBeTruthy();
  expect(engine.getSnapshot().audioTimeMs).toBe(position);
  expect(engine.getSnapshot().playbackEpoch).toBe(epoch);
  expect(engine.audio).toBe(media);
  expect(main.audio.volume).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: '테이크 음소거' }));
  expect(engine.audio.volume).toBe(0);
  expect(screen.getByText(/녹음 입력이 디지털 최대값/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '테이크 음소거' }));
  expect(engine.audio.volume).toBeCloseTo(0.1);
  fireEvent.click(screen.getByLabelText('A/B peak 음량 맞춤'));
  expect(engine.audio.volume).toBeCloseTo(0.4);
  expect(recordingApi.read).toHaveBeenCalledTimes(1);
  rerender(
    <Context.Provider value={main}>
      <TakeReplay take={b} peer={a} playRequest={1} />
    </Context.Provider>,
  );
  await act(async () => {});
  expect(engine.getSnapshot().audioTimeMs).toBe(600);
  expect(screen.queryByText(/녹음 입력이 디지털 최대값/)).toBeNull();
  expect(a.peak).toBe(1);
  expect(b.peak).toBe(0.25);
  expect(engine.getSnapshot().status).toBe('playing');
  expect(engine.audio.volume).toBeCloseTo(0.4);
  expect(
    screen
      .getByRole('slider', { name: '테이크 재생 음량' })
      .getAttribute('value'),
  ).toBe('40');
  expect(main.audio).toBe(originalMedia);
  fireEvent.change(screen.getByLabelText('부분 시작 ms'), {
    target: { value: '500' },
  });
  fireEvent.change(screen.getByLabelText('부분 끝 ms'), {
    target: { value: '1500' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '부분 반복 재생' }));
  });
  expect(engine.getSnapshot().loop).toEqual({ startMs: 500, endMs: 1500 });
});

it('저장된 원본 악보를 읽어 A/B 논리 위치와 커서 tick을 유지하고 부분 구간을 반복한다', async () => {
  const { main, originalMedia, replays } = preparePlayback();
  const score = importer.ScoreLoader.loadAlphaTex(
    '. 0.1.4 3.1.4 5.1.4 7.1.4 | 0.1.4 3.1.4 5.1.4 7.1.4',
  );
  const document = normalizeScore(score);
  const track = document.tracks[0];
  const revision = projectFixture().revision;
  if (!track || !revision) throw new Error('리플레이 fixture 필요');
  const a = recordingFixture({ targetScoreTrackId: track.id });
  const b = recordingFixture({
    id: '00000000-0000-4000-8000-000000000009',
    targetScoreTrackId: track.id,
    songStartMs: 1200,
  });
  vi.spyOn(recordingApi, 'revision').mockResolvedValue({
    ...revision,
    projectId: a.projectId,
    revisionId: a.scoreRevisionId,
    score: document,
  });
  const gp = new exporter.Gp7Exporter().export(score);
  vi.spyOn(projectApi, 'read').mockResolvedValue({
    name: 'synthetic-score.gp',
    data: new Uint8Array(gp).buffer,
  });
  const view = (side: 'A' | 'B', playRequest = 0) => (
    <Context.Provider value={main}>
      <TakeReplay
        take={side === 'A' ? a : b}
        peer={side === 'A' ? b : a}
        playRequest={playRequest}
      />
    </Context.Provider>
  );
  const { rerender } = render(view('A'));
  await act(async () => {});
  expect(screen.queryByText(/TAB 표시는 생략/)).toBeNull();
  const engine = [...replays][0];
  if (!engine) throw new Error('리플레이 엔진 필요');
  act(() => engine.seek(1000));
  const tick = Number(screen.getByLabelText('리플레이 커서 tick').textContent);
  expect(tick).toBeCloseTo(2860.8);
  rerender(view('B', 1));
  await act(async () => {});
  expect(engine.getSnapshot().audioTimeMs).toBeCloseTo(600);
  expect(
    Number(screen.getByLabelText('리플레이 커서 tick').textContent),
  ).toBeCloseTo(tick);
  expect(engine.getSnapshot().status).toBe('playing');
  expect(main.audio).toBe(originalMedia);
  expect(recordingApi.read).toHaveBeenNthCalledWith(
    2,
    b.projectId,
    b.id,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  fireEvent.change(screen.getByLabelText('부분 시작 ms'), {
    target: { value: '500' },
  });
  fireEvent.change(screen.getByLabelText('부분 끝 ms'), {
    target: { value: '1500' },
  });
  Object.defineProperty(engine.audio, 'paused', {
    configurable: true,
    get: () => false,
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '부분 반복 재생' }));
  });
  for (let loop = 0; loop < 3; loop++) {
    act(() => {
      engine.audio.currentTime = 1.6;
      engine.audio.dispatchEvent(new Event('timeupdate'));
    });
    expect(engine.getSnapshot().audioTimeMs).toBe(500);
    expect(engine.audio.currentTime).toBe(0.5);
    expect(engine.getSnapshot().status).toBe('playing');
  }
  expect(
    Number(screen.getByLabelText('리플레이 커서 tick').textContent),
  ).toBeCloseTo(2764.8);
  expect(projectApi.read).toHaveBeenCalledTimes(2);
});
