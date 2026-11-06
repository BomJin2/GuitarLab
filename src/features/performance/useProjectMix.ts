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
import { recordingApi, type RecordedTake } from '../recordings/recordings';
import type { JobSnapshot } from '../library/projects';
import { LatestTask } from '../../shared/latestTask';
import { TakeMixPlayer, type MixPlaybackEntry } from './TakeMixPlayer';
import { wavPeak } from './mixLabels';
import { importedStemsApi, type ImportedGuitarStem } from './importedStems';
import {
  separationApi,
  type SeparationInfo,
} from '../transcription/separation';
import {
  decodeMix,
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
export type MixAuto = { take: RecordedTake | null; locked: boolean };

export function useProjectMix(
  projectId: string | undefined,
  backingId: string | null,
  revisionId: string | undefined,
  enabled: boolean,
  auto: MixAuto | null = null,
) {
  const autoOn = auto !== null;
  const main = usePlayerEngine();
  const [mix, setMix] = useState<MixDocument | null>(null);
  const [takes, setTakes] = useState<RecordedTake[]>([]);
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
  const [player] = useState(
    () =>
      new TakeMixPlayer(main, (message) => {
        setPrepared(false);
        setError(message);
      }),
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
    setPrepared(false);
  }, [player]);
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
      const [saved, list] = await Promise.all([
        mixApi.load(projectId),
        recordingApi.list(projectId),
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
      else if (prepared) player.update(next);
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
      let budget = 64 * 1024 * 1024;
      const entries: MixPlaybackEntry[] = [];
      const peaks: Record<string, number> = {};
      for (const layer of mix.layers.filter((l) => l.kind !== 'LOCAL_ASSET')) {
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
        if (take.frames * 4 + 58 > budget)
          throw new Error('MIX_LIMIT_EXCEEDED');
        const bytes = await recordingApi.read(
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
        '믹스 준비 완료 · 정지 상태에서 REC를 누르면3초 준비 후 반주와 새 입력 녹음을 시작합니다.',
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
    !!visibleMix?.layers.some(
      (l) =>
        l.kind === 'STEM' ||
        l.kind === 'IMPORTED_STEM' ||
        (l.kind === 'TAKE' && layerVolume(visibleMix, l) > 0),
    ) && !visiblePrepared;
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
