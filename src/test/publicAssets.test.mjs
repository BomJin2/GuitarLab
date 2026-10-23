// @vitest-environment node
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import {
  copyPublicAssets,
  publicAssetNames,
} from '../../scripts/publicAssets.mjs';

async function removeTestRoot(root) {
  const resolved = await realpath(root);
  if (
    dirname(resolved) !== (await realpath(tmpdir())) ||
    !basename(resolved).startsWith('guitarlab-public-')
  )
    throw new Error('테스트 정리 경로 오류');
  await rm(resolved, { recursive: true, force: true });
}

test('지정 공개 자산만 복사하고 사용자 녹음/악보와 원본은 보존한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guitarlab-public-'));
  const source = join(root, 'public');
  const destination = join(root, 'dist');
  try {
    for (const name of [
      ...publicAssetNames,
      'fixtures/private-take.wav',
      'fixtures/exported.json',
    ]) {
      const path = join(source, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, name);
    }
    await copyPublicAssets(source, destination);
    expect((await readdir(join(destination, 'fixtures'))).sort()).toEqual(
      publicAssetNames
        .filter((n) => n.startsWith('fixtures/'))
        .map((n) => n.slice('fixtures/'.length))
        .sort(),
    );
    expect(
      await readFile(join(source, 'fixtures/private-take.wav'), 'utf8'),
    ).toBe('fixtures/private-take.wav');
    for (const name of publicAssetNames)
      expect(await readFile(join(destination, name), 'utf8')).toBe(name);
  } finally {
    await removeTestRoot(root);
  }
});
