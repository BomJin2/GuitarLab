import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// public 안에 사용자가 저장한 녹음/악보가 있어도 제품 번들에는 지정 자산만 복사합니다.
export const publicAssetNames = [
  'fixtures/standard.musicxml',
  'fixtures/dual-guitar.musicxml',
  'fixtures/standard.gp',
  'fixtures/sine.wav',
  'fixtures/sine.mp3',
  ...['eot', 'svg', 'otf', 'woff', 'woff2'].map((ext) => `font/Bravura.${ext}`),
  ...['OFL-FAQ', 'FONTLOG', 'OFL'].map((name) => `font/Bravura-${name}.txt`),
  ...['sonivox.sf2', 'sonivox.sf3', 'README.md', 'LICENSE'].map(
    (name) => `soundfont/${name}`,
  ),
];

export async function copyPublicAssets(source, destination) {
  for (const name of publicAssetNames) {
    const output = join(destination, name);
    await mkdir(dirname(output), { recursive: true });
    await copyFile(join(source, name), output);
  }
}

export function publicAssetsPlugin() {
  let config;
  return {
    name: 'guitarlab-public-assets',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async writeBundle() {
      if (!config) throw new Error('공개 자산 빌드 설정이 없습니다.');
      await copyPublicAssets(
        config.publicDir,
        join(config.root, config.build.outDir),
      );
    },
  };
}
