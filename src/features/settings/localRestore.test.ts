import { describe, expect, it } from 'vitest';
import { decodeLocalRestore } from './localRestore';
const valid = {
  schemaVersion: 1,
  state: 'SCHEDULED',
  recoveryId: '00000000-0000-4000-8000-000000000001',
  files: 1,
  bytes: 2147483648,
  externalReferencesNotCopied: 0,
  databaseVersion: 10,
  restartRequired: true,
  errorCode: null,
};
describe('실제 복원 계약', () => {
  it('예약과 과거 결과만 공개하고 준비 지문은 거부한다', () => {
    expect(decodeLocalRestore(valid)).toEqual(valid);
    expect(decodeLocalRestore({ schemaVersion: 1, state: 'IDLE' }).state).toBe(
      'IDLE',
    );
    for (const [key, value] of Object.entries({
      schemaVersion: true,
      files: 0,
      bytes: 2147483649,
      recoveryId: '../private',
      restartRequired: false,
      path: 'private',
      fingerprint: '0'.repeat(64),
      errorCode: 'private',
      databaseVersion: 11,
      state: 'PREPARED',
    }))
      expect(() => decodeLocalRestore({ ...valid, [key]: value })).toThrow(
        'RESTORE_PROTOCOL_INVALID',
      );
  });
  it('실패·되돌림을 완료로 해석하지 않는다', () => {
    expect(
      decodeLocalRestore({
        ...valid,
        state: 'ROLLED_BACK',
        restartRequired: false,
        errorCode: 'RESTORE_ROLLED_BACK',
      }).state,
    ).toBe('ROLLED_BACK');
    expect(() =>
      decodeLocalRestore({ ...valid, state: 'FAILED', restartRequired: false }),
    ).toThrow();
    expect(
      decodeLocalRestore({
        ...valid,
        state: 'FAILED',
        restartRequired: false,
        errorCode: 'RESTORE_ABORTED',
      }).state,
    ).toBe('FAILED');
  });
});
