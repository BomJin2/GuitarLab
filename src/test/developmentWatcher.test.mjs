// @vitest-environment node
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout } from 'node:timers/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createServer, loadConfigFromFile } from 'vite';
import { expect, test } from 'vitest';

async function removeTestDirectory(root) {
  const absoluteRoot = await realpath(root);
  const temporaryRoot = await realpath(tmpdir());
  if (
    dirname(absoluteRoot) !== temporaryRoot ||
    !basename(absoluteRoot).startsWith('guitarlab-dev-watch-')
  ) {
    throw new Error('테스트 임시 경로 검증에 실패했습니다.');
  }
  await rm(absoluteRoot, { recursive: true, force: true });
}

test('문서·네이티브 산출물은 제외하고 UI 소스는 계속 감시한다', async () => {
  const config = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    resolve('vite.config.ts'),
  );
  if (!config?.config.server?.watch) throw new Error('감시 설정이 없습니다.');

  const root = await mkdtemp(join(tmpdir(), 'guitarlab-dev-watch-'));
  const files = [
    'src/main.ts',
    'docs/progress/PHASE-03.md',
    'README.md',
    'src-tauri/target/candidate/tsconfig.json',
    'src-tauri/target/candidate/index.html',
    'public/font/Bravura-OFL.txt',
  ];
  let server;
  try {
    for (const file of files) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), '초기 내용');
    }
    server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      server: {
        middlewareMode: true,
        hmr: false,
        watch: config.config.server.watch,
      },
    });
    const changed = [];
    server.watcher.on('change', (path) => changed.push(resolve(path)));
    const watcher = server.watcher;
    await expect
      .poll(() => watcher.getWatched()[join(root, 'src')]?.includes('main.ts'))
      .toBe(true);

    for (const file of files) await writeFile(join(root, file), '변경 내용');
    await expect
      .poll(() => changed.includes(join(root, 'src/main.ts')))
      .toBe(true);
    // 비동기 감시 이벤트가 도착할 시간을 주어 제외 경로의 실제 변경도 확인합니다.
    await setTimeout(300);
    expect(changed).toEqual([join(root, 'src/main.ts')]);
  } finally {
    await server?.close();
    await removeTestDirectory(root);
  }
}, 15_000);
