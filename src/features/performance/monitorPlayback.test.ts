import { expect, it } from 'vitest';
import {
  decodeMonitorPlayback,
  monitorPlaybackMessage,
} from './monitorPlayback';

it('모니터 테이크 재생 응답을 검사하고 오류 코드를 안내 문구로 바꾼다', () => {
  const ok = {
    schemaVersion: 1,
    takeId: 't',
    playing: true,
    positionMs: 12.5,
    durationMs: 1000,
    leadFrames: 1288,
  };
  expect(decodeMonitorPlayback(ok)).toEqual(ok);
  for (const bad of [
    { ...ok, schemaVersion: 2 },
    { ...ok, positionMs: null },
    { ...ok, durationMs: -1 },
    { ...ok, leadFrames: 1.5 },
    { ...ok, takeId: 3 },
  ])
    expect(() => decodeMonitorPlayback(bad)).toThrow(
      'PLAYBACK_CONTRACT_INVALID',
    );
  expect(monitorPlaybackMessage('MONITOR_NOT_AMPLITUBE')).toContain(
    'AmpliTube',
  );
  expect(monitorPlaybackMessage('UNKNOWN')).toContain('원음');
});
