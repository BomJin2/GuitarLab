import { useState } from 'react';
import type { ScoreSession } from '../score/scoreSession';
import { getActiveTrackIndex } from '../score/trackSelection';
import type { YoutubeSnapshot } from './youtubePlayer';
import {
  createYoutubeManualSync,
  restoreYoutubeManualSync,
  youtubeSyncCursor,
  type YoutubeManualSync,
  type YoutubeSyncDraft,
  type YoutubeSyncContext,
} from './youtubeSync';
import type { YoutubeSyncKey, YoutubeSyncProfile } from './projectYoutubeSync';
import { useYoutubeSyncStorage } from './useYoutubeSyncStorage';

export function useYoutubeSync(
  session: ScoreSession,
  videoId: string,
  snapshot: YoutubeSnapshot | null,
  unavailable: boolean,
  projectId?: string,
  scoreSaved = false,
) {
  const trackIndex = getActiveTrackIndex(session);
  const track = session.document.tracks[trackIndex];
  const bars = session.playbackLookup.masterBars;
  const context: YoutubeSyncContext = {
    scoreId: session.document.id,
    trackId: track?.id ?? '',
    videoId,
    endTick: bars.at(-1)?.end ?? 0,
  };
  const [draft, setDraft] = useState<YoutubeSyncDraft[]>([
    { bar: '1', seconds: '' },
    { bar: String(bars.length + 1), seconds: '' },
  ]);
  const [profile, setProfile] = useState<YoutubeManualSync | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available =
    !unavailable &&
    snapshot?.ready === true &&
    snapshot.videoId === videoId &&
    (snapshot.durationMs ?? 0) > 0;
  const update = (
    index: number,
    field: keyof YoutubeSyncDraft,
    value: string,
  ) => {
    storage.cancel();
    setDraft((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
    setProfile(null);
    setError(null);
  };
  const restore = (stored: YoutubeSyncProfile | null) => {
    if (!stored) {
      setProfile(null);
      setError(null);
      return;
    }
    if (!available || !snapshot?.durationMs)
      throw new Error('영상 정보를 준비한 뒤 저장 맞춤을 다시 읽어주세요.');
    const restored = restoreYoutubeManualSync(
      context,
      bars.map((bar) => bar.start),
      stored,
      snapshot.durationMs,
    );
    setDraft(restored.draft);
    setProfile(restored.profile);
    setError(null);
  };
  const revision = session.savedRevision;
  const key: YoutubeSyncKey | null =
    scoreSaved && revision && revision.projectId === projectId
      ? {
          schemaVersion: 1,
          projectId: revision.projectId,
          revisionId: revision.revisionId,
          videoId,
          trackId: context.trackId,
        }
      : null;
  const storage = useYoutubeSyncStorage(
    key,
    unavailable || !available,
    restore,
  );
  return {
    storage,
    hasSavedScore: !!key,
    save() {
      if (profile && snapshot?.durationMs)
        void storage.save({
          scoreId: context.scoreId,
          endTick: context.endTick,
          durationMs: snapshot.durationMs,
          anchors: profile.anchors,
        });
    },
    context,
    trackIndex,
    trackName: track?.name,
    barCount: bars.length,
    draft,
    error,
    profile,
    cursor: youtubeSyncCursor(profile, context, snapshot, unavailable),
    available,
    canCapture: available && snapshot?.state === 2,
    update,
    capture(index: number) {
      if (available && snapshot?.state === 2 && snapshot.currentTimeMs !== null)
        update(index, 'seconds', String(snapshot.currentTimeMs / 1000));
    },
    apply() {
      storage.cancel();
      if (!available || snapshot?.durationMs === null || !snapshot) return;
      try {
        setProfile(
          createYoutubeManualSync(
            context,
            bars.map((bar) => bar.start),
            draft,
            snapshot.durationMs,
          ),
        );
        setError(null);
      } catch (cause) {
        setProfile(null);
        setError(
          cause instanceof Error
            ? cause.message
            : '수동 싱크를 적용하지 못했습니다.',
        );
      }
    },
    clear() {
      storage.cancel();
      setProfile(null);
      setError(null);
    },
  };
}
