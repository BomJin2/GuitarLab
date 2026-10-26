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
  publicAssetsPlugin,
} from '../../scripts/publicAssets.mjs';

async function seedSource(root) {
  const source = join(root, 'public');
  for (const name of [
    ...publicAssetNames,
    'fixtures/private-take.wav',
    'fixtures/exported.json',
  ]) {
    const path = join(source, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, name);
  }
  return source;
}

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
  const destination = join(root, 'dist');
  try {
    const source = await seedSource(root);
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

test.each(['relative', 'absolute'])(
  'Vite %s 출력 경로에도 허용 자산만 복사하고 원본을 유지한다',
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), 'guitarlab-public-'));
    try {
      const source = await seedSource(root);
      const outDir =
        kind === 'relative' ? 'nested/dist' : join(root, '별도 출력', 'dist');
      const expected =
        kind === 'relative' ? join(root, 'nested', 'dist') : outDir;
      const plugin = publicAssetsPlugin();
      plugin.configResolved({ root, publicDir: source, build: { outDir } });
      await plugin.writeBundle();
      for (const name of publicAssetNames)
        expect(await readFile(join(expected, name), 'utf8')).toBe(name);
      expect((await readdir(join(expected, 'fixtures'))).sort()).toEqual(
        publicAssetNames
          .filter((name) => name.startsWith('fixtures/'))
          .map((name) => name.slice('fixtures/'.length))
          .sort(),
      );
      expect(
        await readFile(join(source, 'fixtures/private-take.wav'), 'utf8'),
      ).toBe('fixtures/private-take.wav');
    } finally {
      await removeTestRoot(root);
    }
  },
);
