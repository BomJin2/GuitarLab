import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePlayerEngine } from '../player/usePlayer';
import { PlayerEngine } from '../player/PlayerEngine';
import { NativeTransport, nativePlaybackApi } from '../player/nativeTransport';
import { logDiagnostic } from '../../shared/logger';
import { recordingApi, type RecordedTake } from '../recordings/recordings';
import type { JobSnapshot } from '../library/projects';
import { LatestTask } from '../../shared/latestTask';
import { TakeMixPlayer, type MixPlaybackEntry } from './TakeMixPlayer';
import {
  monitorPlaybackApi,
  monitorPlaybackMessage,
  playbackErrorCode,
} from './monitorPlayback';
import { wavPeak } from './mixLabels';
import {
  freezeApi,
  freezeErrorCode,
  freezeMessage,
  type TakeRender,
} from './freeze';
import { importedStemsApi, type ImportedGuitarStem } from './importedStems';
import {
  separationApi,
  type SeparationInfo,
} from '../transcription/separation';
import {
  decodeMix,
  layerNeedsPreparation,
  layerVolume,
  mixApi,
  mixError,
  type MixDocument,
  type MixStats,
} from './mixing';

// docs/12 "새 테이크 자동 믹스·자동 준비": 현재 리비전·반주에 맞춰 녹음한 READY 테이크만 자동 대상입니다.
function autoEligible(
  take: RecordedTake,
  projectId: string | undefined,
  revisionId: string | undefined,
  backingId: string | null,
) {
  return (
    !!backingId &&
    take.projectId === projectId &&
    take.state === 'READY' &&
    take.scoreRevisionId === revisionId &&
    take.transport?.backingAssetId === backingId
  );
}
const takeLayer = (id: string) => ({
  kind: 'TAKE' as const,
  id,
  gain: 0.7,
  mute: false,
  solo: false,
  offsetMs: 0,
});
// docs/12 "로컬 반주 줄 항상 표시": 현재 반주 레이어를 맨 앞에 하나 둡니다.
// 없던 반주는 음소거로 넣어 이전 믹스의 들리는 결과를 유지합니다.
function withBacking(mix: MixDocument, backingId: string | null): MixDocument {
  if (!backingId) return mix;
  const found = mix.layers.find((l) => l.kind === 'LOCAL_ASSET');
  const rest = mix.layers.filter((l) => l.kind !== 'LOCAL_ASSET');
  if (!found && mix.layers.length >= 8) return mix;
  const backing = found
    ? { ...found, id: backingId, offsetMs: 0 }
    : {
        kind: 'LOCAL_ASSET' as const,
        id: backingId,
        gain: 0.5,
        mute: true,
        solo: false,
        offsetMs: 0,
      };
  return { ...mix, layers: [backing, ...rest] };
}
export type MixAuto = {
  take: RecordedTake | null;
  locked: boolean;
};
const NATIVE_KEY = 'guitarlab.nativePlayback';
function readNativePreference() {
  try {
    return window.localStorage.getItem(NATIVE_KEY) !== '0';
  } catch {
    return true;
  }
}
const nativeReasons: Record<string, string> = {
  MIX_FORMAT_UNSUPPORTED: '지원하지 않거나 손상된 음원 형식',
  MIX_LIMIT_EXCEEDED: '용량 한도 초과',
  MONITOR_OUTPUT_UNAVAILABLE: '출력 장치를 열 수 없음',
  MONITOR_RATE_UNSUPPORTED: '출력 장치 샘플레이트',
  NATIVE_RATE_UNSUPPORTED: '배속으로 녹음한 테이크',
  NATIVE_NOT_PREPARED: '출력 샘플레이트가 바뀜',
};
export function nativeReason(code: string) {
  return nativeReasons[code] ?? '알 수 없는 오류';
}
const codeOf = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  typeof (cause as { code?: unknown }).code === 'string'
    ? (cause as { code: string }).code
    : cause instanceof Error
      ? cause.message
      : 'UNKNOWN';

export function useProjectMix(
  projectId: string | undefined,
  backingId: string | null,
  revisionId: string | undefined,
  enabled: boolean,
  auto: MixAuto | null = null,
  /** docs/12 "네이티브 재생 v1": 모니터에서 고른 출력 장치. 있으면 믹스를 Rust로 재생합니다(배속 포함, R5). */
  outputDeviceId?: string,
) {
  const autoOn = auto !== null;
  const main = usePlayerEngine();
  const [mix, setMix] = useState<MixDocument | null>(null);
  const [takes, setTakes] = useState<RecordedTake[]>([]);
  // docs/12 "테이크 Freeze v1": Freeze된 테이크(재생·내보내기는 캐시)
  const [freezes, setFreezes] = useState<TakeRender[]>([]);
  // docs/12 "Bounce to New Track v1": 영구 처리 결과(RENDER 레이어 원본)
  const [bounces, setBounces] = useState<TakeRender[]>([]);
  const [stems, setStems] = useState<SeparationInfo['stems']>([]);
  const [importedStems, setImportedStems] = useState<ImportedGuitarStem[]>([]);
  // docs/12 "하단 믹서 최대 레벨 추정": 믹스 준비 때 이미 읽은 분리 음원 바이트의 최대값입니다.
  const [stemPeaks, setStemPeaks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJobState] = useState<JobSnapshot | null>(null);
  const [stats, setStats] = useState<MixStats | null>(null);
  const [preview] = useState(() => new PlayerEngine());
  // docs/12 "모니터 테이크 재생 v1": AmpliTube 모니터로 재생하는 테이크(화면 세션에만 둠)
  const [wetTakeId, setWetTakeId] = useState<string | null>(null);
  // docs/12 "네이티브 재생 v1": 지금 메인 재생기에 붙인 Rust transport와 사용자 설정
  const native = useRef<NativeTransport | null>(null);
  const [nativeOn, setNativeOn] = useState(readNativePreference);
  const [nativeActive, setNativeActive] = useState(false);
  // AmpliTube 테이크 재생(2B)을 고르면 그 준비만 기존 재생 경로로 합니다.
  const skipNative = useRef(false);
  // Freeze 목록을 못 읽었을 때의 안내(준비 완료 안내에도 남깁니다).
  const freezeWarning = useRef<string | null>(null);
  const [player] = useState(
    () =>
      new TakeMixPlayer(
        main,
        (message) => {
          setPrepared(false);
          setError(message);
        },
        monitorPlaybackApi,
        (takeId, message) => {
          setWetTakeId(takeId);
          if (message) setNotice(message);
        },
      ),
  );
  // docs/12 "실시간 레벨 미터": 재생 요소 목록(안정된 함수라 미터가 다시 시작되지 않음)
  const levelSources = useCallback(() => player.mediaElements(), [player]);
  const task = useRef(new LatestTask());
  const operation = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(false);
  // 자동으로 넣은(또는 넣으려 본) 테이크와 마지막 자동 준비 레이어 구성입니다.
  const autoSeen = useRef(new Set<string>());
  const autoTried = useRef<string | null>(null);
  const context = useMemo(
    () => ({ projectId, backingId, revisionId }),
    [projectId, backingId, revisionId],
  );
  const owner = useRef(context);
  const currentEnabled = useRef(enabled);
  const ownsContext = () => mounted.current && owner.current === context;
  const visible = owner.current === context;
  const visibleMix = visible ? mix : null;
  const visiblePrepared = visible && prepared;
  useLayoutEffect(() => {
    currentEnabled.current = enabled;
  }, [enabled]);
  // docs/12 "준비 전 반주 음량": 믹스 준비 전에도 로컬 반주의 음량·음소거·Solo를
  // 메인 재생에 바로 반영합니다. 준비·작업 중이거나 화면을 떠나면 원래 음량으로 되돌립니다.
  const backingLayer = visibleMix?.layers.find((l) => l.kind === 'LOCAL_ASSET');
  const backingVolume =
    enabled && visibleMix && backingLayer && !visiblePrepared && !busy
      ? layerVolume(visibleMix, backingLayer)
      : null;
  const savedVolume = useRef<number | null>(null);
  const releaseBacking = useCallback(() => {
    if (savedVolume.current === null) return;
    main.setVolume(savedVolume.current);
    savedVolume.current = null;
  }, [main]);
  useLayoutEffect(() => {
    if (backingVolume === null) return releaseBacking();
    savedVolume.current ??= main.getSnapshot().volume;
    main.setVolume(backingVolume);
  }, [backingVolume, main, releaseBacking]);
  useLayoutEffect(() => releaseBacking, [releaseBacking]);
  function setJob(value: JobSnapshot | null) {
    if (ownsContext()) setJobState(value);
  }
  const clear = useCallback(() => {
    player.clear();
    if (native.current) {
      native.current = null;
      main.detachNative();
    }
    setNativeActive(false);
    setPrepared(false);
  }, [player, main]);
  const refresh = useCallback(async () => {
    if (!mounted.current || owner.current !== context || !projectId) return;
    const current = ++epoch.current;
    clear();
    setStems([]);
    setImportedStems([]);
    setStemPeaks({});
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let freezeFailure: unknown = null;
      const [saved, list, frozen, bounced] = await Promise.all([
        mixApi.load(projectId),
        recordingApi.list(projectId),
        // Freeze 목록을 못 읽으면 원본으로 재생하되, 조용히 바꾸지 않고 아래에서 알립니다.
        freezeApi.list(projectId).catch((cause: unknown) => {
          freezeFailure = cause;
          return [] as TakeRender[];
        }),
        freezeApi.listBounces(projectId).catch(() => [] as TakeRender[]),
      ]);
      if (
        !mounted.current ||
        owner.current !== context ||
        current !== epoch.current
      )
        return;
      if (
        (saved && saved.projectId !== projectId) ||
        list.some((take) => take.projectId !== projectId)
      )
        throw new Error('MIX_SOURCE_UNAVAILABLE');
      autoTried.current = null;
      const autoTakes = autoOn
        ? list
            .filter((t) => autoEligible(t, projectId, revisionId, backingId))
            .slice(0, 7)
        : [];
      for (const t of autoTakes) autoSeen.current.add(t.id);
      setMix(
        (saved && withBacking(saved, backingId)) ?? {
          schemaVersion: 1,
          projectId,
          masterGain: 0.7,
          layers: backingId
            ? [
                {
                  kind: 'LOCAL_ASSET',
                  id: backingId,
                  gain: 0.5,
                  mute: false,
                  solo: false,
                  offsetMs: 0,
                },
                ...autoTakes.map((t) => takeLayer(t.id)),
              ]
            : [],
        },
      );
      setTakes(list);
      setFreezes(frozen);
      setBounces(bounced);
      freezeWarning.current =
        freezeFailure === null
          ? null
          : `Freeze 목록을 읽지 못했습니다(${freezeMessage(freezeFailure)}). 이번에는 Freeze된 테이크도 원본 DI로 재생합니다.`;
      if (freezeWarning.current) setNotice(freezeWarning.current);
    } catch (cause) {
      if (
        mounted.current &&
        owner.current === context &&
        current === epoch.current
      )
        setError(mixError(cause));
    } finally {
      if (
        mounted.current &&
        owner.current === context &&
        current === epoch.current
      )
        setBusy(false);
    }
  }, [projectId, backingId, revisionId, autoOn, clear, context]);
  useLayoutEffect(() => {
    owner.current = context;
    mounted.current = true;
    preview.activate();
    setMix(null);
    setPrepared(false);
    setTakes([]);
    setStems([]);
    setImportedStems([]);
    setStemPeaks({});
    setBusy(false);
    setStats(null);
    setJobState(null);
    setError(null);
    setNotice(null);
    void refresh();
    const currentTask = task.current;
    const generation = epoch;
    return () => {
      mounted.current = false;
      generation.current++;
      currentTask.cancel();
      player.clear();
      preview.dispose();
    };
  }, [refresh, player, preview, revisionId, context]);
  useLayoutEffect(() => {
    if (!enabled) {
      task.current.cancel();
      clear();
      preview.clear();
      // 이탈로 준비가 풀렸으니 돌아오면 같은 구성도 다시 자동 준비합니다.
      autoTried.current = null;
    }
  }, [enabled, clear, preview]);
  function update(next: MixDocument, structural = false) {
    if (!ownsContext() || !currentEnabled.current) return;
    try {
      if (next.projectId !== projectId)
        throw new Error('MIX_SOURCE_UNAVAILABLE');
      decodeMix(next);
      if (structural) clear();
      else if (prepared && native.current) {
        const current = native.current;
        void nativePlaybackApi.update(next).catch((cause: unknown) => {
          if (native.current !== current) return;
          clear();
          setNotice(
            `Rust 재생 설정을 바꾸지 못했습니다(${nativeReason(codeOf(cause))}). 믹스를 다시 준비하세요.`,
          );
        });
      } else if (prepared) player.update(next);
      setMix(next);
      setStats(null);
      setNotice(null);
      preview.clear();
    } catch (cause) {
      setError(mixError(cause));
    }
  }
  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (
      !ownsContext() ||
      operation.current ||
      !mix ||
      mix.projectId !== projectId ||
      !enabled ||
      !currentEnabled.current
    )
      return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setJob(null);
    const generation = epoch.current;
    const result = await task.current.run(work);
    operation.current = false;
    if (!mounted.current || generation !== epoch.current) return;
    setBusy(false);
    if (result.status === 'error') setError(mixError(result.error));
    else if (result.status === 'canceled')
      setNotice('믹스 작업을 취소했습니다.');
  }
  const prepare = () =>
    run(async (signal) => {
      if (!mix || !backingId || !revisionId)
        throw new Error('MIX_SOURCE_UNAVAILABLE');
      clear();
      main.pause();
      preview.clear();
      // TakeMixPlayer가 사용자의 원래 음량을 기억하도록 준비 전 덮어쓰기를 먼저 풉니다.
      releaseBacking();
      const backing = mix.layers.find((l) => l.kind === 'LOCAL_ASSET');
      if (backing && (backing.id !== backingId || backing.offsetMs !== 0))
        throw new Error('MIX_SOURCE_UNAVAILABLE');
      // docs/12 "믹스 입력 한도 v2": Rust 믹스 출력 예산과 같은 512MiB입니다.
      let fallbackNotice: string | null = freezeWarning.current;
      // 테이크 READY·반주 참조 검사는 Rust·기존 재생 두 경로가 같이 따릅니다(docs/12 믹스 준비).
      for (const layer of mix.layers) {
        if (layer.kind !== 'TAKE') continue;
        const take = takes.find((t) => t.id === layer.id);
        if (
          !take ||
          take.state !== 'READY' ||
          (take.transport && take.transport.backingAssetId !== backingId)
        )
          throw new Error('RECORDING_REFERENCE_INVALID');
      }
      const device = outputDeviceId;
      if (nativeOn && !skipNative.current && device && wetTakeId === null) {
        try {
          const ready = await nativePlaybackApi.prepare(device, mix, backingId);
          if (signal.aborted) {
            void nativePlaybackApi.release().catch(() => undefined);
            return;
          }
          const transport = new NativeTransport(
            nativePlaybackApi,
            ready.durationMs,
          );
          transport.onLost = (code) => {
            if (native.current !== transport) return;
            native.current = null;
            main.detachNative();
            setNativeActive(false);
            setPrepared(false);
            setNotice(
              `Rust 재생이 풀렸습니다(${nativeReason(code)}). 믹스를 다시 준비하면 기존 재생으로도 들을 수 있습니다.`,
            );
          };
          main.attachNative(transport);
          native.current = transport;
          setNativeActive(true);
          setStemPeaks({});
          setPrepared(true);
          setNotice(
            freezeWarning.current ??
              '믹스 준비 완료 · Rust 엔진이 반주와 모든 레이어를 샘플 단위로 맞춰 재생합니다(배속은 피치를 유지한 채 Rust에서 처리). 정지 상태에서 REC를 누르면3초 준비 후 녹음을 시작합니다.',
          );
          return;
        } catch (cause) {
          if (signal.aborted) return;
          logDiagnostic('warn', 'NATIVE_PLAYBACK_FALLBACK');
          const reason = `Rust 재생을 쓰지 못해 기존 재생으로 준비했습니다(${nativeReason(codeOf(cause))}).`;
          // Freeze 목록 실패 안내(DI 대체)는 덮지 않고 함께 남깁니다.
          fallbackNotice = freezeWarning.current
            ? `${freezeWarning.current} ${reason}`
            : reason;
        }
      }
      let budget = 512 * 1024 * 1024;
      const entries: MixPlaybackEntry[] = [];
      const peaks: Record<string, number> = {};
      for (const layer of mix.layers.filter((l) => l.kind !== 'LOCAL_ASSET')) {
        if (layer.kind === 'RENDER') {
          const bounce = bounces.find((b) => b.id === layer.id);
          const source = takes.find((t) => t.id === bounce?.takeId);
          if (!bounce || !source) throw new Error('MIX_SOURCE_UNAVAILABLE');
          if (bounce.bytes > budget) throw new Error('MIX_LIMIT_EXCEEDED');
          const bytes = await freezeApi.readBounce(
            mix.projectId,
            layer.id,
            signal,
            setJob,
          );
          if (signal.aborted) return;
          budget -= bytes.byteLength;
          const peak = wavPeak(bytes);
          if (peak !== null) peaks[layer.id] = peak;
          entries.push({
            kind: 'RENDER',
            stemId: layer.id,
            projectId: mix.projectId,
            bytes,
            source,
          });
          continue;
        }
        if (layer.kind === 'STEM' || layer.kind === 'IMPORTED_STEM') {
          const bytes =
            layer.kind === 'STEM'
              ? await mixApi.readStem(
                  mix.projectId,
                  backingId,
                  layer.id,
                  signal,
                  setJob,
                )
              : (
                  await importedStemsApi.read(
                    mix.projectId,
                    layer.id,
                    signal,
                    setJob,
                  )
                ).bytes;
          if (signal.aborted) return;
          budget -= bytes.byteLength;
          if (budget < 0) throw new Error('MIX_LIMIT_EXCEEDED');
          const peak = wavPeak(bytes);
          if (peak !== null) peaks[layer.id] = peak;
          entries.push({
            kind: layer.kind,
            stemId: layer.id,
            projectId: mix.projectId,
            bytes,
          });
          continue;
        }
        const take = takes.find((t) => t.id === layer.id);
        if (
          !take ||
          take.state !== 'READY' ||
          // 재생 위치는 반주 시간 기준이라 이전 악보 버전 테이크도 듣기는 허용합니다.
          (take.transport && take.transport.backingAssetId !== backingId)
        )
          throw new Error('RECORDING_REFERENCE_INVALID');
        const frozen = freezes.find((f) => f.takeId === take.id);
        if ((frozen ? frozen.bytes : take.frames * 4 + 58) > budget)
          throw new Error('MIX_LIMIT_EXCEEDED');
        let bytes: ArrayBuffer | null = null;
        if (frozen) {
          try {
            bytes = await freezeApi.read(
              mix.projectId,
              take.id,
              signal,
              setJob,
            );
          } catch (cause) {
            if (signal.aborted) return;
            // 캐시가 바뀌었거나 손상됐으면 그 레이어만 원본으로 재생하고 알립니다.
            if (
              !['FREEZE_STALE', 'FREEZE_INVALID'].includes(
                freezeErrorCode(cause),
              )
            )
              throw cause;
            fallbackNotice = freezeMessage(cause);
          }
        }
        bytes ??= await recordingApi.read(
          mix.projectId,
          take.id,
          signal,
          setJob,
        );
        if (signal.aborted) return;
        budget -= bytes.byteLength;
        if (budget < 0) throw new Error('MIX_LIMIT_EXCEEDED');
        entries.push({ take, bytes });
      }
      await player.prepare(mix, entries, signal);
      if (signal.aborted) return;
      setStemPeaks(peaks);
      setPrepared(true);
      setNotice(
        fallbackNotice ??
          '믹스 준비 완료 · 정지 상태에서 REC를 누르면3초 준비 후 반주와 새 입력 녹음을 시작합니다.',
      );
    });
  // Freeze/Unfreeze 뒤에는 재생 준비를 다시 해야 캐시·원본이 바뀝니다.
  const freezeWork = (takeId: string, freeze: boolean) =>
    run(async (signal) => {
      if (!projectId) return;
      clear();
      main.pause();
      try {
        if (freeze) await freezeApi.freeze(projectId, takeId, signal, setJob);
        else await freezeApi.unfreeze(projectId, takeId);
      } catch (cause) {
        if (signal.aborted) return;
        setError(freezeMessage(cause));
        return;
      }
      if (signal.aborted) return;
      const nextFreezes = await freezeApi.list(projectId);
      // 기다리는 사이 작업이 취소됐으면(프로젝트 전환 등) 이전 프로젝트 목록으로 덮지 않습니다.
      if (signal.aborted) return;
      setFreezes(nextFreezes);
      setNotice(
        freeze
          ? 'Freeze 완료 · 이 테이크는 처리된 소리로 재생됩니다(모니터 불필요). 믹스를 다시 준비하세요.'
          : 'Unfreeze 완료 · 캐시를 지우고 원본 DI로 돌아갔습니다. 믹스를 다시 준비하세요.',
      );
    });
  const render = () =>
    run(async (signal) => {
      if (!mix) return;
      clear();
      main.pause();
      preview.pause();
      setStats(null);
      preview.clear();
      const result = await mixApi.render(mix, signal, setJob);
      if (signal.aborted) return;
      preview.load(new Blob([result.bytes], { type: 'audio/wav' }));
      setStats(result.stats);
      setNotice('믹스 파일 준비 완료 · 출력 미리 듣기로 확인하세요.');
    });
  const exportWav = () =>
    run(async (signal) => {
      if (!mix) return;
      clear();
      main.pause();
      preview.pause();
      const result = await mixApi.export(mix, signal, setJob);
      if (!signal.aborted) {
        setStats(result);
        setNotice('새 WAV 파일로 내보냈습니다. 원본은 변경하지 않았습니다.');
      }
    });
  const save = () =>
    run(async (signal) => {
      if (!mix) return;
      await mixApi.save(mix);
      if (!signal.aborted) setNotice('프로젝트 믹스 설정을 저장했습니다.');
    });
  const configureStems = () =>
    run(async (signal) => {
      if (!mix || !backingId) throw new Error('MIX_SOURCE_UNAVAILABLE');
      clear();
      main.pause();
      preview.clear();
      const result = await separationApi.restore(
        { projectId: mix.projectId, assetId: backingId },
        signal,
      );
      if (signal.aborted) return;
      if (
        !result ||
        result.info.projectId !== mix.projectId ||
        result.info.assetId !== backingId
      )
        throw new Error('AI_OUTPUT_INVALID');
      const backing = mix.layers.find((l) => l.kind === 'LOCAL_ASSET');
      update(
        withBacking(
          {
            ...mix,
            layers: [
              // 분리 음원만 들리도록 반주 줄은 지우지 않고 음소거합니다.
              ...(backing ? [{ ...backing, mute: true, solo: false }] : []),
              ...result.info.stems.map((stem) => ({
                kind: 'STEM' as const,
                id: stem.id,
                gain: 0.5,
                mute: false,
                solo: false,
                offsetMs: 0,
              })),
            ],
          },
          backingId,
        ),
        true,
      );
      setStems(result.info.stems);
      setNotice(
        '분리 2개로 출력 믹스를 구성했습니다. 설정 저장 전에는 기존 저장 믹스가 유지됩니다. 출력 믹스 만들기로 확인하세요.',
      );
    });
  const refreshImported = () =>
    run(async (signal) => {
      if (!mix) return;
      const list = await importedStemsApi.list(mix.projectId, signal, setJob);
      if (!signal.aborted) setImportedStems(list);
    });
  function addImported(id: string) {
    if (
      !mix ||
      !ownsContext() ||
      !currentEnabled.current ||
      !enabled ||
      operation.current ||
      !importedStems.some(
        (stem) => stem.id === id && stem.projectId === mix.projectId,
      )
    )
      return;
    update(
      {
        ...mix,
        layers: [
          ...mix.layers,
          {
            kind: 'IMPORTED_STEM',
            id,
            gain: 0.7,
            mute: false,
            solo: false,
            offsetMs: 0,
          },
        ],
      },
      true,
    );
  }
  const needsPreparation =
    !!visibleMix?.layers.some((l) => layerNeedsPreparation(visibleMix, l)) &&
    !visiblePrepared;
  const commands = useRef({ update, prepare });
  useLayoutEffect(() => {
    commands.current = { update, prepare };
  });
  const newTake = auto?.take ?? null;
  useEffect(() => {
    if (
      !autoOn ||
      !newTake ||
      !visibleMix ||
      !enabled ||
      busy ||
      autoSeen.current.has(newTake.id) ||
      !autoEligible(newTake, projectId, revisionId, backingId)
    )
      return;
    autoSeen.current.add(newTake.id);
    const layers = visibleMix.layers;
    if (
      layers.some((l) => l.id === newTake.id) ||
      layers.length >= 8 ||
      layers.filter((l) => l.kind === 'TAKE').length >= 7
    )
      return;
    setTakes((list) =>
      list.some((t) => t.id === newTake.id) ? list : [...list, newTake],
    );
    commands.current.update(
      { ...visibleMix, layers: [...layers, takeLayer(newTake.id)] },
      true,
    );
  }, [
    autoOn,
    newTake,
    visibleMix,
    enabled,
    busy,
    projectId,
    revisionId,
    backingId,
  ]);
  const mainStatus = useSyncExternalStore(
    main.subscribe,
    () => main.getSnapshot().status,
  );
  const structure =
    visibleMix?.layers.map((l) => `${l.kind}:${l.id}`).join() ?? '';
  const autoLocked = auto?.locked ?? true;
  useEffect(() => {
    if (
      !autoOn ||
      autoLocked ||
      !needsPreparation ||
      busy ||
      !enabled ||
      !backingId ||
      !revisionId ||
      mainStatus === 'playing' ||
      mainStatus === 'countIn' ||
      autoTried.current === structure
    )
      return;
    // 같은 구성은 한 번만 시도해 실패·연결 해제 뒤 반복 준비하지 않습니다.
    autoTried.current = structure;
    void commands.current.prepare();
  }, [
    autoOn,
    autoLocked,
    needsPreparation,
    busy,
    enabled,
    backingId,
    revisionId,
    mainStatus,
    structure,
  ]);
  return {
    mix: visibleMix,
    takes: visible ? takes : [],
    stems: visible ? stems : [],
    importedStems: visible ? importedStems : [],
    stemPeaks: visible ? stemPeaks : {},
    levelSources,
    wetTakeId: visible ? wetTakeId : null,
    setWetTake: async (takeId: string | null) => {
      if (!ownsContext()) return;
      if (takeId && freezes.some((f) => f.takeId === takeId)) {
        setNotice(freezeMessage({ code: 'FREEZE_ACTIVE' }));
        return;
      }
      try {
        // Rust 재생 중이면 AmpliTube 테이크 재생을 위해 기존 재생 경로로 다시 준비합니다.
        if (takeId && native.current) {
          skipNative.current = true;
          try {
            clear();
            await prepare();
          } finally {
            skipNative.current = false;
          }
          if (native.current) return;
        }
        await player.setWet(takeId);
      } catch (cause) {
        setNotice(monitorPlaybackMessage(playbackErrorCode(cause)));
      }
    },
    freezes: visible ? freezes : [],
    freezeTake: (takeId: string) => freezeWork(takeId, true),
    bounces: visible ? bounces : [],
    // docs/12 "Bounce 삭제·관리 v1"
    addBounceToMix: (renderId: string) => {
      // 준비·작업 중에는 구성을 바꾸지 않습니다(준비 중인 믹스와 화면 믹스가 달라지지 않게).
      if (
        operation.current ||
        !mix ||
        mix.layers.some((l) => l.id === renderId)
      )
        return;
      if (mix.layers.length >= 8) {
        setError(freezeMessage({ code: 'MIX_LIMIT_EXCEEDED' }));
        return;
      }
      update(
        {
          ...mix,
          layers: [
            ...mix.layers,
            {
              kind: 'RENDER',
              id: renderId,
              gain: 0.7,
              mute: false,
              solo: false,
              offsetMs: 0,
            },
          ],
        },
        true,
      );
    },
    deleteBounce: (renderId: string) =>
      run(async (signal) => {
        if (!projectId) return;
        try {
          await freezeApi.deleteBounce(projectId, renderId);
        } catch (cause) {
          if (!signal.aborted) setError(freezeMessage(cause));
          return;
        }
        if (signal.aborted) return;
        const nextBounces = await freezeApi.listBounces(projectId);
        // 기다리는 사이 작업이 취소됐으면(프로젝트 전환 등) 이전 프로젝트 목록으로 덮지 않습니다.
        if (signal.aborted) return;
        setBounces(nextBounces);
        // 저장 전 화면 믹스에만 있던 줄은 함께 뺍니다.
        if (mix?.layers.some((l) => l.id === renderId))
          update(
            { ...mix, layers: mix.layers.filter((l) => l.id !== renderId) },
            true,
          );
        setNotice('Bounce 파일을 지웠습니다. 원본 테이크·DI는 그대로입니다.');
      }),
    // 새 RENDER 레이어를 원본 테이크 다음에 넣고 원본 줄은 음소거합니다(같은 소리 겹침 방지).
    bounceTake: (takeId: string) =>
      run(async (signal) => {
        if (!projectId || !mix) return;
        main.pause();
        let made: TakeRender;
        try {
          made = await freezeApi.bounce(projectId, takeId, signal, setJob);
        } catch (cause) {
          if (!signal.aborted) setError(freezeMessage(cause));
          return;
        }
        if (signal.aborted) return;
        const nextBounces = await freezeApi.listBounces(projectId);
        // 기다리는 사이 작업이 취소됐으면(프로젝트 전환 등) 이전 프로젝트 목록으로 덮지 않습니다.
        if (signal.aborted) return;
        setBounces(nextBounces);
        const at = mix.layers.findIndex((l) => l.id === takeId);
        if (mix.layers.length >= 8 || at < 0) {
          setError(freezeMessage({ code: 'MIX_LIMIT_EXCEEDED' }));
          return;
        }
        // 원본의 Solo는 Bounce 줄로 옮깁니다(원본만 음소거하면 Solo 때문에 둘 다 무음).
        const layers = mix.layers.map((l) =>
          l.id === takeId ? { ...l, mute: true, solo: false } : l,
        );
        const source = mix.layers[at];
        layers.splice(at + 1, 0, {
          kind: 'RENDER',
          id: made.id,
          gain: source?.gain ?? 0.7,
          mute: false,
          solo: source?.solo ?? false,
          offsetMs: source?.offsetMs ?? 0,
        });
        update({ ...mix, layers }, true);
        setNotice(
          'Bounce 완료 · 처리된 소리를 새 트랙으로 넣고 원본 테이크 줄은 음소거했습니다. 믹스를 다시 준비하고, 남기려면 믹스 설정을 저장하세요.',
        );
      }),
    exportFreeze: (takeId: string) =>
      run(async (signal) => {
        if (!projectId) return;
        try {
          const bytes = await freezeApi.export(
            projectId,
            takeId,
            signal,
            setJob,
          );
          if (!signal.aborted)
            setNotice(
              `처리된 소리를 새 WAV로 내보냈습니다(${(bytes / 1048576).toFixed(1)}MB, stereo float32). 원본 DI와 캐시는 그대로입니다.`,
            );
        } catch (cause) {
          if (!signal.aborted) setError(freezeMessage(cause));
        }
      }),
    unfreezeTake: (takeId: string) => freezeWork(takeId, false),
    restoreFreezeTone: async (takeId: string) => {
      if (!ownsContext() || !projectId) return;
      try {
        await freezeApi.restoreTone(projectId, takeId);
        setNotice(
          'Freeze 때 톤을 AmpliTube에 불러왔습니다. 편집 창·모니터에 바로 적용됩니다.',
        );
      } catch (cause) {
        setNotice(freezeMessage(cause));
      }
    },
    refreshImported,
    addImported,
    configureStems,
    canConfigureStems: !!backingId,
    busy: visible && busy,
    prepared: visiblePrepared,
    error: visible ? error : null,
    notice: visible ? notice : null,
    job: visible ? job : null,
    stats: visible ? stats : null,
    preview,
    refresh,
    update,
    prepare,
    clear: () => {
      if (ownsContext()) clear();
    },
    render,
    exportWav,
    save,
    cancel: () => {
      if (!ownsContext()) return;
      task.current.cancel();
      clear();
    },
    // docs/12 "네이티브 재생 v1"
    nativePlayback: nativeOn,
    nativeActive: visiblePrepared && nativeActive,
    setNativePlayback: (value: boolean) => {
      setNativeOn(value);
      try {
        window.localStorage.setItem(NATIVE_KEY, value ? '1' : '0');
      } catch {
        // 저장하지 못해도 이번 실행에는 적용합니다.
      }
      clear();
    },
    referenceTakeIds:
      visiblePrepared && visibleMix
        ? visibleMix.layers
            .filter(
              (l) =>
                l.kind === 'TAKE' &&
                layerVolume(visibleMix, l) > 0 &&
                // 백엔드는 같은 리비전 테이크만 REC 참조로 받습니다.
                takes.find((t) => t.id === l.id)?.scoreRevisionId ===
                  revisionId,
            )
            .map((l) => l.id)
        : [],
    needsPreparation,
    revisionId,
  };
}
export type ProjectMixController = ReturnType<typeof useProjectMix>;
