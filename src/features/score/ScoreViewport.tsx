import { useEffect, useRef, useState, useMemo } from 'react';
import {
  AlphaTabApi,
  StaveProfile,
  LayoutMode,
  type model,
  type midi,
} from '@coderline/alphatab';
import type { NoteNavigation } from './scoreNoteSelection';
export function ScoreViewport({
  score,
  lookup,
  trackIndex,
  tick,
  onSelectNote,
  onNavigateNote,
}: {
  score: model.Score;
  lookup: midi.MidiTickLookup;
  trackIndex: number;
  tick: number | null;
  onSelectNote?: (note: model.Note) => void;
  onNavigateNote?: (direction: NoteNavigation) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);
  const selectNoteRef = useRef(onSelectNote);
  selectNoteRef.current = onSelectNote;
  const selectable = !!onSelectNote;
  const tracks = useMemo(() => new Set([trackIndex]), [trackIndex]);
  useEffect(() => {
    if (!host.current) return;
    setError(false);
    const api = new AlphaTabApi(host.current, {
      core: {
        fontDirectory: '/font/',
        useWorkers: true,
        includeNoteBounds: selectable,
      },
      display: { staveProfile: StaveProfile.Tab, layoutMode: LayoutMode.Page },
      player: { enablePlayer: false, enableUserInteraction: false },
    });
    apiRef.current = api;
    api.renderFinished.on(() => setRevision((value) => value + 1));
    api.error.on(() => setError(true));
    api.noteMouseDown.on((note) => {
      if (apiRef.current !== api || !selectNoteRef.current) return;
      selectNoteRef.current(note);
      scrollerRef.current?.focus({ preventScroll: true });
    });
    api.renderScore(score, [trackIndex]);
    return () => {
      apiRef.current = null;
      api.destroy();
    };
  }, [score, trackIndex, selectable]);
  useEffect(() => {
    const result = tick === null ? null : lookup.findBeat(tracks, tick);
    const bounds = result
      ? apiRef.current?.boundsLookup?.findBeat(result.beat)
      : null;
    const cursor = cursorRef.current;
    if (!cursor) return;
    cursor.hidden = !bounds;
    if (bounds) {
      cursor.style.left = `${bounds.onNotesX}px`;
      cursor.style.top = `${bounds.realBounds.y}px`;
      cursor.style.height = `${bounds.realBounds.h}px`;
      const scroller = scrollerRef.current;
      if (scroller) {
        const rect = cursor.getBoundingClientRect();
        const parent = scroller.getBoundingClientRect();
        const top = parent.top + scroller.clientTop;
        if (rect.top < top || rect.bottom > top + scroller.clientHeight)
          scroller.scrollTop = Math.max(
            0,
            scroller.scrollTop +
              rect.top -
              top -
              scroller.clientHeight / 2 +
              rect.height / 2,
          );
      }
    }
  }, [tick, lookup, tracks, revision]);
  return (
    <section
      ref={scrollerRef}
      className="score-real"
      aria-label="실제 TAB 악보"
      tabIndex={onNavigateNote ? 0 : undefined}
      aria-keyshortcuts={
        onNavigateNote ? 'ArrowLeft ArrowRight Home End' : undefined
      }
      onKeyDown={(event) => {
        if (
          !onNavigateNote ||
          event.target !== event.currentTarget ||
          event.ctrlKey ||
          event.altKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        const direction =
          event.key === 'ArrowLeft'
            ? 'previous'
            : event.key === 'ArrowRight'
              ? 'next'
              : event.key === 'Home'
                ? 'first'
                : event.key === 'End'
                  ? 'last'
                  : null;
        if (direction) {
          event.preventDefault();
          onNavigateNote(direction);
        }
      }}
    >
      {error && <p role="alert">악보를 표시할 수 없습니다.</p>}
      <div ref={host} />
      <div ref={cursorRef} hidden aria-hidden="true" className="score-cursor" />
    </section>
  );
}
