import { expect, it } from 'vitest';
import { backupError, decodeLocalBackup } from './localBackup';

it('백업 완료를 엄격히 검사하고 경로·큰 수·복원 지원 주장을 거부한다', () => {
  const valid = {
    schemaVersion: 1,
    state: 'COMPLETED',
    files: 3,
    bytes: 1024,
    externalReferencesNotCopied: 2,
    restoreSupported: false,
  };
  expect(decodeLocalBackup(valid)).toEqual(valid);
  const checked = { ...valid, state: 'VERIFIED' };
  expect(() => decodeLocalBackup(checked)).toThrow();
  expect(decodeLocalBackup(checked, 'VERIFIED').state).toBe('VERIFIED');
  expect(() => decodeLocalBackup(valid, 'VERIFIED')).toThrow();
  const preview = {
    ...valid,
    state: 'RESTORED_TO_NEW_FOLDER',
    appDataReplaced: false,
  };
  expect(decodeLocalBackup(preview, 'RESTORED_TO_NEW_FOLDER')).toEqual(preview);
  expect(() => decodeLocalBackup(preview)).toThrow();
  expect(() =>
    decodeLocalBackup(
      { ...preview, appDataReplaced: true },
      'RESTORED_TO_NEW_FOLDER',
    ),
  ).toThrow();
  expect(() =>
    decodeLocalBackup(
      { ...valid, state: 'RESTORED_TO_NEW_FOLDER' },
      'RESTORED_TO_NEW_FOLDER',
    ),
  ).toThrow();
  for (const bad of [
    { ...valid, bytes: 268435457 },
    { ...valid, files: 0 },
    { ...valid, bytes: NaN },
    { ...valid, schemaVersion: 2 },
    { ...valid, restoreSupported: true },
    { ...valid, path: 'private' },
  ])
    expect(() => decodeLocalBackup(bad)).toThrow();
  expect(backupError(new Error('C:/private/user.wav'))).not.toContain(
    'private',
  );
});
