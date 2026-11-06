import { useEffect, useRef, useState } from 'react';
import { importedStemsApi } from '../performance/importedStems';
import { mixApi } from '../performance/mixing';
import type { ProjectMixController } from '../performance/useProjectMix';
import { recordingApi } from '../recordings/recordings';
import { decodePeaks } from './dawWaveform';

// docs/12 "DAW 보기 v2": 믹스 준비와 같은 64MiB 읽기 예산입니다.
const BUDGET = 64 * 1024 * 1024;
const noop = () => {};
// 믹스 준비 등 다른 파일 작업이 끝나기를 기다리는 간격·횟수(최대 20초)
const BUSY_RETRY_MS = 500;
const BUSY_RETRIES = 40;
/** 다른 파일 작업 중(STORAGE_BUSY)인 일시 오류인지 봅니다. */
const storageBusy = (cause: unknown) =>
  (cause instanceof Error
    ? cause.message
    : (cause as { code?: unknown })?.code) === 'STORAGE_BUSY';
/** 일시 오류면 잠깐 기다렸다 다시 읽습니다. 끝까지 바쁘면 그 오류를 그대로 던집니다. */
async function retryWhileBusy<T>(read: () => Promise<T>, signal: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (cause) {
      if (signal.aborted || !storageBusy(cause) || attempt >= BUSY_RETRIES)
        throw cause;
      await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS));
    }
  }
}

/** undefined = 읽는 중, null = 실패, 'SKIPPED' = 용량 제한으로 생략 */
export type DawPeaks = number[] | null | 'SKIPPED' | undefined;
export type DawTrack = {
  key: string;
  name: string;
  /** 들리지 않는 이유. null이면 들립니다(docs/12 DAW v2 "꺼짐 표시"). */
  silent: '음소거' | 'Solo 때문에 꺼짐' | '음량 0' | null;
  /** null이면 곡 위치가 없어 클립을 그리지 않습니다. */
  startMs: number | null;
  /** null이면 아직 길이를 모릅니다(디코딩 전). */
  lengthMs: number | null;
  peaks: DawPeaks;
};
type Loaded = {
  peaks: Exclude<DawPeaks, undefined>;
  durationMs: number | null;
  bytes: number;
  name?: string;
};

/** 프로젝트 믹스의 STEM·IMPORTED_STEM·TAKE 레이어를 DAW 트랙 줄로 바꾸고, 보기가 열려 있을 때 파형을 하나씩 읽습니다. */
export function useDawTracks(
  mix: Pick<ProjectMixController, 'mix' | 'takes' | 'stems' | 'importedStems'>,
  projectId: string | undefined,
  backingId: string | null,
  active: boolean,
): DawTrack[] {
  const [loaded, setLoaded] = useState<{
    projectId?: string;
    items: Record<string, Loaded>;
  }>({ items: {} });
  const items = loaded.projectId === projectId ? loaded.items : {};
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const layers = (mix.mix?.layers ?? []).filter(
    (layer) => layer.kind !== 'LOCAL_ASSET',
  );
  const layersKey = layers.map((l) => `${l.kind}:${l.id}`).join(',');

  useEffect(() => {
    if (!active || !projectId || !layersKey) return;
    const controller = new AbortController();
    const { signal } = controller;
    const save = (key: string, value: Loaded) =>
      setLoaded((prev) => ({
        projectId,
        items: {
          ...(prev.projectId === projectId ? prev.items : {}),
          [key]: value,
        },
      }));
    void (async () => {
      let spent = Object.values(itemsRef.current).reduce(
        (sum, item) => sum + item.bytes,
        0,
      );
      for (const key of layersKey.split(',')) {
        if (signal.aborted) return;
        if (itemsRef.current[key]) continue;
        if (spent >= BUDGET) {
          save(key, { peaks: 'SKIPPED', durationMs: null, bytes: 0 });
          continue;
        }
        const [kind, id = ''] = key.split(':');
        try {
          const { bytes, name } = await retryWhileBusy(async () => {
            if (kind === 'TAKE')
              return {
                bytes: await recordingApi.read(projectId, id, signal, noop),
                name: undefined,
              };
            if (kind === 'STEM') {
              if (!backingId) throw new Error('MIX_SOURCE_UNAVAILABLE');
              return {
                bytes: await mixApi.readStem(
                  projectId,
                  backingId,
                  id,
                  signal,
                  noop,
                ),
                name: undefined,
              };
            }
            const read = await importedStemsApi.read(
              projectId,
              id,
              signal,
              noop,
            );
            return { bytes: read.bytes, name: read.stem.name };
          }, signal);
          if (signal.aborted) return;
          if (spent + bytes.byteLength > BUDGET) {
            save(key, { peaks: 'SKIPPED', durationMs: null, bytes: 0, name });
            continue;
          }
          spent += bytes.byteLength;
          const wave = await decodePeaks(new Blob([bytes]));
          if (signal.aborted) return;
          save(key, { ...wave, bytes: bytes.byteLength, name });
        } catch (cause) {
          if (signal.aborted) return;
          // 끝까지 다른 작업 중이면 실패로 기억하지 않아, 다시 열 때 새로 읽습니다.
          if (storageBusy(cause)) continue;
          save(key, { peaks: null, durationMs: null, bytes: 0 });
        }
      }
    })();
    return () => controller.abort();
  }, [active, projectId, backingId, layersKey]);

  return layers.map((layer) => {
    const key = `${layer.kind}:${layer.id}`;
    const item = items[key];
    const doc = mix.mix;
    const silent: DawTrack['silent'] = layer.mute
      ? '음소거'
      : doc?.layers.some((l) => l.solo) && !layer.solo
        ? 'Solo 때문에 꺼짐'
        : layer.gain * (doc?.masterGain ?? 1) === 0
          ? '음량 0'
          : null;
    const base = { key, silent, peaks: item?.peaks };
    if (layer.kind === 'TAKE') {
      const take = mix.takes.find((t) => t.id === layer.id);
      return {
        ...base,
        name: take?.name ?? '누락된 테이크',
        // TakeMixPlayer와 같은 식: 곡 시간 = songStartMs + 정렬 보정 + 레이어 오프셋
        startMs:
          take && take.songStartMs !== null
            ? take.songStartMs + take.alignmentOffsetMs + layer.offsetMs
            : null,
        lengthMs: take
          ? (take.frames / take.sampleRate) * 1000 * (take.transport?.rate ?? 1)
          : null,
      };
    }
    const role =
      layer.kind === 'STEM'
        ? mix.stems.find((stem) => stem.id === layer.id)?.role
        : undefined;
    return {
      ...base,
      name:
        layer.kind === 'STEM'
          ? role === 'GUITAR_FULL'
            ? '전체 기타 · AI 추정'
            : role === 'ACCOMPANIMENT'
              ? '잔여 반주 · AI 추정'
              : 'AI 분리 음원'
          : (item?.name ??
            mix.importedStems.find((stem) => stem.id === layer.id)?.name ??
            '사용자 기타 파일'),
      startMs: layer.offsetMs,
      lengthMs: item?.durationMs ?? null,
    };
  });
}
