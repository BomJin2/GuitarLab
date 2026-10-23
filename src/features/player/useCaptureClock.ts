import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  captureAnchor,
  decodeInputClock,
  type CaptureAnchor,
} from './captureClock';
import { usePlayerEngine } from './usePlayer';
import type { AudioSnapshot } from '../practice/audioInput';

export type ClockState = {
  status: 'IDLE' | 'WARMING' | 'READY' | 'UNCERTAIN';
  roundTripMs: number | null;
  anchorCount: number;
  maximumResidualRealMs: number | null;
};
const idle: ClockState = {
  status: 'IDLE',
  roundTripMs: null,
  anchorCount: 0,
  maximumResidualRealMs: null,
};
export function decodeClockDiagnostic(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('ready' in value) ||
    typeof value.ready !== 'boolean' ||
    !('anchorCount' in value) ||
    typeof value.anchorCount !== 'number' ||
    !Number.isInteger(value.anchorCount) ||
    value.anchorCount < 0 ||
    value.anchorCount > 12 ||
    !('maximumResidualRealMs' in value) ||
    typeof value.maximumResidualRealMs !== 'number' ||
    !Number.isFinite(value.maximumResidualRealMs) ||
    value.maximumResidualRealMs < 0 ||
    value.maximumResidualRealMs > 20
  )
    throw new Error('AUDIO_CONTRACT_INVALID');
  return {
    ready: value.ready,
    anchorCount: value.anchorCount,
    maximumResidualRealMs: value.maximumResidualRealMs,
  };
}
export function useCaptureClock(
  input: AudioSnapshot,
  native: boolean,
  enabled = true,
) {
  const engine = usePlayerEngine();
  const [diagnostic, setDiagnostic] = useState<ClockState>(idle);
  useEffect(() => {
    if (!native || !enabled || input.state !== 'RUNNING') {
      setDiagnostic(idle);
      return;
    }
    const streamGeneration = input.streamGeneration;
    let canceled = false;
    let busy = false;
    let revision = 0;
    let sequence = 0;
    let lastResetEpoch: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let identity = `${engine.getSnapshot().playbackEpoch}:${engine.getSnapshot().status}`;
    async function update(epoch: number, anchor: CaptureAnchor | null) {
      const value = await invoke<unknown>('update_capture_clock', {
        request: {
          schemaVersion: 1,
          streamGeneration,
          playbackEpoch: epoch,
          requestSequence: ++sequence,
          anchor: anchor
            ? {
                monotonicNs: anchor.monotonicNs,
                songTimeMs: anchor.songTimeMs,
                rate: anchor.rate,
                uncertaintyRealMs: anchor.uncertaintyRealMs,
              }
            : null,
        },
      });
      return decodeClockDiagnostic(value);
    }
    async function synchronize() {
      if (busy || canceled) return;
      busy = true;
      const current = revision;
      const before = engine.readClock();
      try {
        const nativeClock = decodeInputClock(
          await invoke<unknown>('get_audio_clock'),
        );
        if (canceled || current !== revision) return;
        if (nativeClock.streamGeneration !== streamGeneration)
          throw new Error('AUDIO_CONTRACT_INVALID');
        sequence = Math.max(sequence, nativeClock.lastRequestSequence);
        if (sequence >= Number.MAX_SAFE_INTEGER)
          throw new Error('AUDIO_CONTRACT_INVALID');
        engine.synchronizeEpochFloor(nativeClock.lastPlaybackEpoch);
        if (current !== revision) return;
        if (!before.playing) {
          if (lastResetEpoch !== before.playbackEpoch) {
            await update(before.playbackEpoch, null);
            lastResetEpoch = before.playbackEpoch;
          }
          if (!canceled && current === revision) setDiagnostic(idle);
          return;
        }
        lastResetEpoch = null;
        const after = engine.readClock();
        if (canceled || current !== revision) return;
        const roundTripMs = after.performanceTimeMs - before.performanceTimeMs;
        const anchor = captureAnchor(before, after, nativeClock);
        const result = await update(after.playbackEpoch, anchor);
        if (!canceled && current === revision)
          setDiagnostic({
            status: anchor ? (result.ready ? 'READY' : 'WARMING') : 'UNCERTAIN',
            roundTripMs,
            anchorCount: result.anchorCount,
            maximumResidualRealMs: result.maximumResidualRealMs,
          });
      } catch {
        if (!canceled && current === revision)
          setDiagnostic({ ...idle, status: 'UNCERTAIN' });
      } finally {
        busy = false;
        if (!canceled)
          timer = setTimeout(
            () => void synchronize(),
            current === revision ? 200 : 0,
          );
      }
    }
    const unsubscribe = engine.subscribe(() => {
      const next = `${engine.getSnapshot().playbackEpoch}:${engine.getSnapshot().status}`;
      if (next === identity) return;
      identity = next;
      revision++;
      setDiagnostic(idle);
      clearTimeout(timer);
      void synchronize();
    });
    void synchronize();
    return () => {
      canceled = true;
      revision++;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [engine, native, enabled, input.state, input.streamGeneration]);
  return diagnostic;
}
