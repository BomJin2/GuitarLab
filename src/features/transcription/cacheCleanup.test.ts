import { expect, it } from 'vitest';
import {
  cacheCleanupError,
  decodeCacheCleared,
  decodeCacheUsage,
  type CacheUsage,
} from './cacheCleanup';

const usage: CacheUsage = {
  schemaVersion: 1,
  state: 'CACHE_USAGE',
  modelId: 'basic-pitch',
  modelVersion: '0.4.0',
  profile: 'CP312_DOWNLOADS',
  files: 3,
  bytes: 1024,
  revision: 'a'.repeat(64),
};
it('모델·프로필·revision·논리 바이트 경계를 확인하며 경로와 다른 설치 상태를 거부한다', () => {
  expect(decodeCacheUsage(usage, 'basic-pitch')).toEqual(usage);
  for (const bad of [
    { ...usage, profile: 'CP310_DOWNLOADS' },
    { ...usage, modelId: 'htdemucs_6s' },
    { ...usage, revision: 'bad' },
    { ...usage, bytes: NaN },
    { ...usage, bytes: 2147483649 },
    { ...usage, files: 43 },
    { ...usage, files: 0 },
    { ...usage, path: 'private' },
    { ...usage, schemaVersion: 2 },
  ])
    expect(() => decodeCacheUsage(bad, 'basic-pitch')).toThrow();
  const cleared = {
    schemaVersion: 1,
    state: 'CACHE_CLEARED',
    modelId: 'basic-pitch',
    modelVersion: '0.4.0',
    profile: 'CP312_DOWNLOADS',
    removedFiles: 3,
    removedBytes: 1024,
    installedEnvironmentsChanged: false,
  };
  expect(decodeCacheCleared(cleared, 'basic-pitch')).toEqual(cleared);
  expect(() =>
    decodeCacheCleared(
      { ...cleared, installedEnvironmentsChanged: true },
      'basic-pitch',
    ),
  ).toThrow();
  expect(() => decodeCacheCleared(usage, 'basic-pitch')).toThrow();
  expect(cacheCleanupError(new Error('C:/private/user.wav'))).not.toContain(
    'private',
  );
  expect(cacheCleanupError(new Error('AI_CACHE_CHANGED'), true)).toContain(
    '일부 캐시는 이미 삭제',
  );
});
