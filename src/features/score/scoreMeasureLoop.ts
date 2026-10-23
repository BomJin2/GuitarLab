import type { midi } from '@coderline/alphatab';
import type { SyncAnchor } from '../../entities/score';
import type { PlaybackLoop } from '../player/PlayerEngine';
import { scoreTickToAudioTime, validateLoop } from '../player/sync';

export function scoreMeasureLoop(
  lookup: Pick<midi.MidiTickLookup, 'masterBars'>,
  anchors: SyncAnchor[],
  first: number,
  last: number,
  durationMs: number,
): PlaybackLoop {
  if (
    !Number.isInteger(first) ||
    !Number.isInteger(last) ||
    first < 0 ||
    last < first ||
    last >= lookup.masterBars.length
  )
    throw new Error('시작·끝 마디의 재생 순서를 확인하세요.');
  const start = lookup.masterBars[first];
  const end = lookup.masterBars[last];
  if (!start || !end || start.start < 0 || end.end <= start.start)
    throw new Error('반복할 마디의 재생 범위를 확인하세요.');
  const loop = {
    startMs: scoreTickToAudioTime(anchors, start.start),
    endMs: scoreTickToAudioTime(anchors, end.end),
  };
  validateLoop(loop.startMs, loop.endMs, durationMs);
  return loop;
}
