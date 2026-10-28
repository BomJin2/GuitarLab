import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { recordingFixture } from '../../test/recordingFixture';
import { recordedPitchesFixture } from '../../test/recordedPitchesFixture';
import { recordedPitchTrackFixture } from '../../test/recordedPitchTrackFixture';
import type { JobSnapshot } from '../library/projects';
import type { RecordedTake } from './recordings';
import { recordedPitchesApi, type RecordedPitches } from './recordedPitches';
import { recordedPitchTrackApi } from './recordedPitchTrack';
import { takeExportApi } from './takeExport';
import { useRecordedPitches } from './useRecordedPitches';
import { useTakeExport } from './useTakeExport';

vi.mock('./recordedPitches', async (original) => ({
  ...(await original<typeof import('./recordedPitches')>()),
  recordedPitchesApi: { available: () => true, analyze: vi.fn() },
}));
vi.mock('./recordedPitchTrack', async (original) => ({
  ...(await original<typeof import('./recordedPitchTrack')>()),
  recordedPitchTrackApi: { available: () => true, analyze: vi.fn() },
}));
vi.mock('./takeExport', async (original) => ({
  ...(await original<typeof import('./takeExport')>()),
  takeExportApi: { available: () => true, export: vi.fn() },
}));

const take = recordingFixture();
const exported = { bytes: 58 + take.frames * 4, sha256: 'a'.repeat(64) };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(takeExportApi.export).mockResolvedValue(exported);
  vi.mocked(recordedPitchesApi.analyze).mockResolvedValue(
    recordedPitchesFixture(),
  );
  vi.mocked(recordedPitchTrackApi.analyze).mockResolvedValue(
    recordedPitchTrackFixture(),
  );
});
afterEach(cleanup);

const progressJob: JobSnapshot = {
  schemaVersion: 1,
  jobId: '00000000-0000-4000-8000-000000000008',
  state: 'RUNNING',
  completedBytes: 100,
  totalBytes: 200,
  result: null,
  errorCode: null,
};

it.each(['성공', '실패'] as const)(
  '이전 분석의 늦은 진행·%s 응답은 숨기고 실제 종료까지 잠근다',
  async (outcome) => {
    let finish: ((value: RecordedPitches) => void) | undefined;
    let fail: ((cause: Error) => void) | undefined;
    let progress: ((job: JobSnapshot) => void) | undefined;
    let signal: AbortSignal | undefined;
    vi.mocked(recordedPitchesApi.analyze).mockImplementationOnce(
      (_, __, value, report) => {
        signal = value;
        progress = report;
        return new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        });
      },
    );
    const hook = renderHook(
      (value: RecordedTake) => useRecordedPitches(value),
      { initialProps: take },
    );
    let pending: Promise<void> | undefined;
    act(() => {
      pending = hook.result.current.analyze();
    });
    act(() => progress?.(progressJob));
    expect(hook.result.current.job).toEqual(progressJob);
    hook.rerender(recordingFixture({ sha256: 'b'.repeat(64) }));
    expect(signal?.aborted).toBe(true);
    expect(hook.result.current.busy).toBe(true);
    expect(hook.result.current.canceling).toBe(true);
    act(() => progress?.(progressJob));
    expect(hook.result.current.job).toBeNull();
    await act(async () => hook.result.current.analyze());
    expect(recordedPitchesApi.analyze).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (outcome === '성공') finish?.(recordedPitchesFixture());
      else fail?.(new Error('WAV_INVALID'));
      await pending;
    });
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.result).toBeNull();
    expect(hook.result.current.error).toBeNull();
    await act(async () => hook.result.current.analyze());
    expect(recordedPitchesApi.analyze).toHaveBeenCalledTimes(2);
  },
);

it('누락이 생기면 같은 파일 ID라도 분석 결과와 이전 실행 권한을 해제한다', async () => {
  const hook = renderHook((value: RecordedTake) => useRecordedPitches(value), {
    initialProps: take,
  });
  await act(async () => hook.result.current.analyze());
  const old = hook.result.current;
  hook.rerender(recordingFixture({ droppedFrames: 480 }));
  expect(hook.result.current.result).toBeNull();
  expect(hook.result.current.reason).toContain('누락 없는 READY');
  await act(async () => {
    await old.analyze();
    await hook.result.current.analyze();
  });
  expect(recordedPitchesApi.analyze).toHaveBeenCalledTimes(1);
});

it('현재 오류는 표시하고 다음 선택의 첫 반환에는 이전 오류를 숨긴다', async () => {
  vi.mocked(takeExportApi.export).mockRejectedValueOnce(
    new Error('DISK_SPACE_LOW'),
  );
  vi.mocked(recordedPitchesApi.analyze).mockRejectedValueOnce(
    new Error('WAV_INVALID'),
  );
  const seen: (string | null)[] = [];
  const hook = renderHook(
    (value: RecordedTake) => {
      const exporting = useTakeExport(value);
      const pitches = useRecordedPitches(value);
      seen.push(exporting.error, pitches.error);
      return { exporting, pitches };
    },
    { initialProps: take },
  );
  await act(async () => {
    await hook.result.current.exporting.exportTake();
    await hook.result.current.pitches.analyze();
  });
  expect(hook.result.current.exporting.error).toContain('저장 공간');
  expect(hook.result.current.pitches.error).toContain('무결성');
  seen.length = 0;
  hook.rerender(recordingFixture({ projectId: crypto.randomUUID() }));
  expect(seen.every((error) => error === null)).toBe(true);
});

it('이전 내보내기 취소 명령은 현재 파일 작업을 중단하지 않는다', async () => {
  let finish: ((value: typeof exported) => void) | undefined;
  let signal: AbortSignal | undefined;
  const hook = renderHook((value: RecordedTake) => useTakeExport(value), {
    initialProps: take,
  });
  const old = hook.result.current;
  hook.rerender(recordingFixture({ id: crypto.randomUUID() }));
  vi.mocked(takeExportApi.export).mockImplementationOnce((_, value) => {
    signal = value;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.exportTake();
  });
  act(() => old.cancel());
  expect(signal?.aborted).toBe(false);
  expect(hook.result.current.canceling).toBe(false);
  act(() => hook.result.current.cancel());
  expect(signal?.aborted).toBe(true);
  expect(hook.result.current.busy).toBe(true);
  expect(hook.result.current.canceling).toBe(true);
  expect(hook.result.current.canceling).toBe(true);
  await act(async () => {
    finish?.(exported);
    await pending;
  });
  expect(hook.result.current.busy).toBe(false);
  expect(hook.result.current.message).toContain('이미 저장을 마친 파일은 유지');
});

it('이탈 뒤 보관된 내보내기·분석 명령은 새 파일 작업을 시작하지 않는다', async () => {
  const hook = renderHook(() => ({
    exporting: useTakeExport(take),
    pitches: useRecordedPitches(take),
  }));
  const old = hook.result.current;
  hook.unmount();
  await act(async () => {
    await old.exporting.exportTake();
    await old.pitches.analyze();
  });
  expect(takeExportApi.export).not.toHaveBeenCalled();
  expect(recordedPitchesApi.analyze).not.toHaveBeenCalled();
});

it('같은 테이크로 돌아와도 이전 내보내기·분석 명령은 재사용하지 않는다', async () => {
  const hook = renderHook(
    (value: RecordedTake) => ({
      exporting: useTakeExport(value),
      pitches: useRecordedPitches(value),
    }),
    { initialProps: take },
  );
  const old = hook.result.current;
  hook.rerender(recordingFixture({ id: crypto.randomUUID() }));
  hook.rerender(take);
  await act(async () => {
    await old.exporting.exportTake();
    await old.pitches.analyze();
  });
  expect(takeExportApi.export).not.toHaveBeenCalled();
  expect(recordedPitchesApi.analyze).not.toHaveBeenCalled();
});

it.each([
  { sha256: 'b'.repeat(64) },
  { frames: take.frames + 48000 },
  { sampleRate: 44100 },
  { state: 'RECOVERABLE_ERROR' as const },
])(
  '파일 속성이 바뀐 첫 반환부터 이전 성공·분석 결과를 숨긴다: %j',
  async (patch) => {
    const seen: {
      message: string | null;
      pitches: ReturnType<typeof useRecordedPitches>['result'];
    }[] = [];
    const hook = renderHook(
      (value: RecordedTake) => {
        const exporting = useTakeExport(value);
        const pitches = useRecordedPitches(value);
        seen.push({ message: exporting.message, pitches: pitches.result });
        return { exporting, pitches };
      },
      { initialProps: take },
    );
    await act(async () => {
      await hook.result.current.exporting.exportTake();
      await hook.result.current.pitches.analyze();
    });
    expect(hook.result.current.exporting.message).toBeTruthy();
    expect(hook.result.current.pitches.result).toBeTruthy();
    seen.length = 0;
    hook.rerender(recordingFixture(patch));
    expect(
      seen.every((state) => state.message === null && state.pitches === null),
    ).toBe(true);
  },
);

it.each(['시작', '방식'] as const)(
  '분석 %s 변경과 같은 이벤트의 이전 명령은 실행하지 않는다',
  async (kind) => {
    const hook = renderHook(() => useRecordedPitches(take));
    const old = hook.result.current;
    await act(async () => {
      if (kind === '시작') old.changeStart('2000');
      else old.changeMode('TRACK');
      await old.analyze();
    });
    expect(recordedPitchesApi.analyze).not.toHaveBeenCalled();
    expect(recordedPitchTrackApi.analyze).not.toHaveBeenCalled();
    await act(async () => hook.result.current.analyze());
    if (kind === '시작')
      expect(recordedPitchesApi.analyze).toHaveBeenCalledWith(
        take,
        2000,
        expect.any(AbortSignal),
        expect.any(Function),
      );
    else expect(recordedPitchTrackApi.analyze).toHaveBeenCalledTimes(1);
  },
);

it('이름·메모·정렬값만 바뀌면 분석 결과와 내보내기 안내를 유지한다', async () => {
  const hook = renderHook(
    (value: RecordedTake) => ({
      exporting: useTakeExport(value),
      pitches: useRecordedPitches(value),
    }),
    { initialProps: take },
  );
  await act(async () => {
    await hook.result.current.exporting.exportTake();
    await hook.result.current.pitches.analyze();
  });
  const before = hook.result.current;
  hook.rerender(
    recordingFixture({
      name: '이름 변경',
      memo: '메모 변경',
      alignmentOffsetMs: 150,
    }),
  );
  expect(hook.result.current.exporting.message).toBe(before.exporting.message);
  expect(hook.result.current.pitches.result).toBe(before.pitches.result);
  expect(recordedPitchesApi.analyze).toHaveBeenCalledTimes(1);
  expect(takeExportApi.export).toHaveBeenCalledTimes(1);
});

it('테이크 변경 시 내보내기를 취소하고 실제 종료 전 잠금을 유지한다', async () => {
  let finish: ((value: typeof exported) => void) | undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(takeExportApi.export).mockImplementationOnce((_, value) => {
    signal = value;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const hook = renderHook((value: RecordedTake) => useTakeExport(value), {
    initialProps: take,
  });
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.exportTake();
  });
  hook.rerender(recordingFixture({ id: crypto.randomUUID() }));
  expect(signal?.aborted).toBe(true);
  expect(hook.result.current.busy).toBe(true);
  await act(async () => hook.result.current.exportTake());
  expect(takeExportApi.export).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish?.(exported);
    await pending;
  });
  expect(hook.result.current.busy).toBe(false);
  expect(hook.result.current.message).toBeNull();
  expect(hook.result.current.error).toBeNull();
});

it('이전 취소·입력 명령은 현재 분석을 바꾸거나 중단하지 않는다', async () => {
  let finish: ((value: RecordedPitches) => void) | undefined;
  let signal: AbortSignal | undefined;
  const hook = renderHook(() => useRecordedPitches(take));
  const old = hook.result.current;
  act(() => old.changeStart('2000'));
  vi.mocked(recordedPitchesApi.analyze).mockImplementationOnce(
    (_, __, value) => {
      signal = value;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.analyze();
  });
  act(() => {
    old.cancel();
    old.changeMode('TRACK');
    old.changeStart('3000');
  });
  expect(signal?.aborted).toBe(false);
  expect(hook.result.current.canceling).toBe(false);
  expect(hook.result.current.startText).toBe('2000');
  await act(async () => {
    finish?.({ ...recordedPitchesFixture(), startMs: 2000 });
    await pending;
  });
  expect(hook.result.current.result?.startMs).toBe(2000);
});
