import { expect, it } from 'vitest';
import {
  backupError,
  decodeLocalBackup,
  type LocalBackupResult,
} from './localBackup';

const backupStates: LocalBackupResult['state'][] = [
  'COMPLETED',
  'VERIFIED',
  'RESTORED_TO_NEW_FOLDER',
];
it.each(backupStates)(
  '백업 %s 결과는 2GiB까지 허용하고 초과는 거부한다',
  (state) => {
    const result = {
      schemaVersion: 1,
      state,
      files: 4,
      bytes: 512 * 1024 * 1024,
      externalReferencesNotCopied: 0,
      restoreSupported: false,
      ...(state === 'RESTORED_TO_NEW_FOLDER' ? { appDataReplaced: false } : {}),
    };
    expect(decodeLocalBackup(result, state).bytes).toBe(result.bytes);
    expect(
      decodeLocalBackup({ ...result, bytes: 2 * 1024 ** 3 }, state).bytes,
    ).toBe(2 * 1024 ** 3);
    expect(() =>
      decodeLocalBackup({ ...result, bytes: 2 * 1024 ** 3 + 1 }, state),
    ).toThrow();
  },
);

it('백업 경로 오류와 ZIP 형식 오류를 구분하고 민감한 경로를 숨긴다', () => {
  expect(backupError(new Error('BACKUP_PATH_INVALID'))).toBe(
    '백업 데이터 또는 저장 위치의 경로를 확인하지 못했습니다. 기존 데이터는 유지했습니다.',
  );
  expect(backupError(new Error('BACKUP_MANIFEST_INVALID'))).toBe(
    '지원하는 GuitarLab 로컬 백업 ZIP이 아닙니다.',
  );
  expect(backupError(new Error('C:/private/user.zip'))).not.toContain(
    'private',
  );
});

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
    { ...valid, bytes: 2147483649 },
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
