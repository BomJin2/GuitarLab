import { useEffect, useRef, useState, useMemo } from 'react';
import { AlphaTabApi, type model, type midi } from '@coderline/alphatab';
import type { NoteNavigation } from './scoreNoteSelection';
import {
  alphaTabDisplay,
  createDisplayScore,
  defaultScoreDisplay,
  type ScoreDisplaySettings,
} from './scoreDisplay';
export function ScoreViewport({
  score,
  lookup,
  trackIndex,
  tick,
  onSelectNote,
  onNavigateNote,
  display = defaultScoreDisplay,
}: {
  score: model.Score;
  lookup: midi.MidiTickLookup;
  trackIndex: number;
  tick: number | null;
  onSelectNote?: (note: model.Note) => void;
  onNavigateNote?: (direction: NoteNavigation) => void;
  display?: ScoreDisplaySettings;
}) {
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);
  const [rendering, setRendering] = useState(true);
  const renderReady = useRef(false);
  const displayScore = useRef<ReturnType<typeof createDisplayScore> | null>(
    null,
  );
  const { notation, layout, scale } = display;
  const selectNoteRef = useRef(onSelectNote);
  selectNoteRef.current = onSelectNote;
  const tracks = useMemo(() => new Set([trackIndex]), [trackIndex]);
  useEffect(() => {
    if (!host.current) return;
    setError(false);
    setRendering(true);
    renderReady.current = false;
    if (cursorRef.current) cursorRef.current.hidden = true;
    let rendered: ReturnType<typeof createDisplayScore>;
    try {
      rendered = createDisplayScore(score, trackIndex, notation);
    } catch {
      setError(true);
      setRendering(false);
      displayScore.current = null;
      return;
    }
    displayScore.current = rendered;
    const api = new AlphaTabApi(host.current, {
      core: {
        fontDirectory: '/font/',
        useWorkers: true,
      },
      display: alphaTabDisplay({ notation, layout, scale }),
      player: { enablePlayer: false, enableUserInteraction: false },
    });
    apiRef.current = api;
    // alphaTab 1.6.1은 공용 스타일을 다른 ID로 찾아 화면이 열릴 때마다 중복 추가합니다(docs/12). 첫 번째만 남깁니다.
    document
      .querySelectorAll('style#alphaTabStyleShared')
      .forEach((style, index) => index > 0 && style.remove());
    api.renderStarted.on(() => {
      if (apiRef.current !== api) return;
      renderReady.current = false;
      setRendering(true);
      if (cursorRef.current) cursorRef.current.hidden = true;
    });
    api.postRenderFinished.on(() => {
      if (apiRef.current !== api) return;
      renderReady.current = true;
      setRendering(false);
      setError(false);
      setRevision((value) => value + 1);
    });
    api.error.on(() => {
      if (apiRef.current !== api) return;
      renderReady.current = false;
      setRendering(false);
      if (cursorRef.current) cursorRef.current.hidden = true;
      setError(true);
    });
    api.beatMouseDown.on((beat) => {
      const note = beat.notes.length === 1 ? beat.notes[0] : undefined;
      if (!note) return;
      if (
        apiRef.current !== api ||
        !renderReady.current ||
        !selectNoteRef.current
      )
        return;
      const original = rendered.notes.get(note);
      if (!original) return;
      selectNoteRef.current(original);
      scrollerRef.current?.focus({ preventScroll: true });
    });
    api.renderScore(rendered.score, [rendered.renderTrackIndex]);
    return () => {
      apiRef.current = null;
      renderReady.current = false;
      displayScore.current = null;
      api.destroy();
    };
  }, [score, trackIndex, notation, layout, scale]);
  useEffect(() => {
    const result = tick === null ? null : lookup.findBeat(tracks, tick);
    const renderedBeat = result
      ? displayScore.current?.beats.get(result.beat)
      : null;
    const bounds =
      renderedBeat && renderReady.current
        ? apiRef.current?.boundsLookup?.findBeat(renderedBeat)
        : null;
    const cursor = cursorRef.current;
    if (!cursor) return;
    cursor.hidden = !bounds;
    if (bounds && result && tick !== null) {
      // 박 사이를 재생 시간 비율로 보간해 커서가 점프하지 않고 흐르게 합니다.
      // 다음 박이 다음 줄에 있으면 현재 마디 오른쪽 끝까지만 이동합니다.
      const next = result.nextBeat
        ? displayScore.current?.beats.get(result.nextBeat.beat)
        : null;
      const nextBounds = next
        ? apiRef.current?.boundsLookup?.findBeat(next)
        : null;
      const bar = bounds.barBounds.masterBarBounds;
      const endX =
        nextBounds &&
        nextBounds.barBounds.masterBarBounds.staffSystemBounds ===
          bar.staffSystemBounds &&
        nextBounds.onNotesX > bounds.onNotesX
          ? nextBounds.onNotesX
          : bar.realBounds.x + bar.realBounds.w;
      const progress =
        result.tickDuration > 0
          ? Math.min(
              1,
              Math.max(0, (tick - result.start) / result.tickDuration),
            )
          : 0;
      cursor.style.left = `${bounds.onNotesX + (endX - bounds.onNotesX) * progress}px`;
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
        const left = parent.left + scroller.clientLeft;
        if (rect.left < left || rect.right > left + scroller.clientWidth)
          scroller.scrollLeft = Math.max(
            0,
            scroller.scrollLeft +
              rect.left -
              left -
              scroller.clientWidth / 2 +
              rect.width / 2,
          );
      }
    }
  }, [tick, lookup, tracks, revision]);
  return (
    <section
      ref={scrollerRef}
      className="score-real"
      aria-label={notation === 'tab' ? '실제 TAB 악보' : '실제 오선보 악보'}
      aria-busy={rendering}
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
      {rendering && <p role="status">악보 표시 준비 중…</p>}
      {error && <p role="alert">악보를 표시할 수 없습니다.</p>}
      <div ref={host} />
      <div ref={cursorRef} hidden aria-hidden="true" className="score-cursor" />
    </section>
  );
}
