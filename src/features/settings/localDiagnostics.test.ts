import { expect, it } from 'vitest';
import { decodeLocalDiagnostics } from './localDiagnostics';

it('고정 코드·정수·64건 경계를 확인하고 경로나 예외 원문을 거부한다', () => {
  const value = {
    schemaVersion: 1,
    persistenceAvailable: true,
    droppedEvents: 0,
    events: [{ unixMs: 1234, code: 'NATIVE_PANIC' }],
  };
  expect(decodeLocalDiagnostics(value)).toEqual(value);
  for (const bad of [
    { ...value, path: 'private' },
    { ...value, schemaVersion: 2 },
    { ...value, droppedEvents: -1 },
    { ...value, droppedEvents: Infinity },
    { ...value, events: Array(65).fill(value.events[0]) },
    { ...value, events: [{ ...value.events[0], message: 'private' }] },
    { ...value, events: [{ unixMs: 1, code: 'PRIVATE_PANIC_PAYLOAD' }] },
    { ...value, events: [{ unixMs: NaN, code: 'NATIVE_PANIC' }] },
  ])
    expect(() => decodeLocalDiagnostics(bad)).toThrow();
});
