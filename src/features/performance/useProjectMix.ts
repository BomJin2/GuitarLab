import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerEngine } from '../player/usePlayer';
import { PlayerEngine } from '../player/PlayerEngine';
import { recordingApi, type RecordedTake } from '../recordings/recordings';
import type { JobSnapshot } from '../library/projects';
import { LatestTask } from '../../shared/latestTask';
import { TakeMixPlayer, type MixPlaybackEntry } from './TakeMixPlayer';
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

export function useProjectMix(
  projectId: string | undefined,
  backingId: string | null,
  revisionId: string | undefined,
  enabled: boolean,
) {
  const main = usePlayerEngine();
  const [mix, setMix] = useState<MixDocument | null>(null);
  const [takes, setTakes] = useState<RecordedTake[]>([]);
  const [stems, setStems] = useState<SeparationInfo['stems']>([]);
  const [importedStems, setImportedStems] = useState<ImportedGuitarStem[]>([]);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [stats, setStats] = useState<MixStats | null>(null);
  const [preview] = useState(() => new PlayerEngine());
  const [player] = useState(
    () =>
      new TakeMixPlayer(main, (message) => {
        setPrepared(false);
        setError(message);
      }),
  );
  const task = useRef(new LatestTask());
  const operation = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(false);
  const clear = useCallback(() => {
    player.clear();
    setPrepared(false);
  }, [player]);
  const refresh = useCallback(async () => {
    if (!projectId) return;
    const current = ++epoch.current;
    clear();
    setStems([]);
    setImportedStems([]);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const [saved, list] = await Promise.all([
        mixApi.load(projectId),
        recordingApi.list(projectId),
      ]);
      if (!mounted.current || current !== epoch.current) return;
      setMix(
        saved ?? {
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
              ]
            : [],
        },
      );
      setTakes(list);
    } catch (cause) {
      if (mounted.current && current === epoch.current)
        setError(mixError(cause));
    } finally {
      if (mounted.current && current === epoch.current) setBusy(false);
    }
  }, [projectId, backingId, clear]);
  useEffect(() => {
    mounted.current = true;
    preview.activate();
    setMix(null);
    setPrepared(false);
    setTakes([]);
    setImportedStems([]);
    setBusy(false);
    setStats(null);
    setJob(null);
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
  }, [refresh, player, preview, revisionId]);
  useEffect(() => {
    if (!enabled) {
      task.current.cancel();
      clear();
      preview.clear();
    }
  }, [enabled, clear, preview]);
  function update(next: MixDocument, structural = false) {
    try {
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
    if (operation.current || !mix || !enabled) return;
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
      const backing = mix.layers.find((l) => l.kind === 'LOCAL_ASSET');
      if (backing && (backing.id !== backingId || backing.offsetMs !== 0))
        throw new Error('MIX_SOURCE_UNAVAILABLE');
      let budget = 64 * 1024 * 1024;
      const entries: MixPlaybackEntry[] = [];
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
          take.scoreRevisionId !== revisionId ||
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
      update(
        {
          ...mix,
          layers: result.info.stems.map((stem) => ({
            kind: 'STEM',
            id: stem.id,
            gain: 0.5,
            mute: false,
            solo: false,
            offsetMs: 0,
          })),
        },
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
  return {
    mix,
    takes,
    stems,
    importedStems,
    refreshImported,
    addImported,
    configureStems,
    canConfigureStems: !!backingId,
    busy,
    prepared,
    error,
    notice,
    job,
    stats,
    preview,
    refresh,
    update,
    prepare,
    clear,
    render,
    exportWav,
    save,
    cancel: () => {
      task.current.cancel();
      clear();
    },
    referenceTakeIds:
      prepared && mix
        ? mix.layers
            .filter((l) => l.kind === 'TAKE' && layerVolume(mix, l) > 0)
            .map((l) => l.id)
        : [],
    needsPreparation:
      !!mix?.layers.some(
        (l) =>
          l.kind === 'STEM' ||
          l.kind === 'IMPORTED_STEM' ||
          (l.kind === 'TAKE' && layerVolume(mix, l) > 0),
      ) && !prepared,
  };
}
export type ProjectMixController = ReturnType<typeof useProjectMix>;
