// docs/12 "라이선스·고지 화면 v2": 배포에 들어가는 npm·Rust 의존성의 이름·버전·라이선스 목록.
// 인자 없이 실행하면 파일을 다시 쓰고, --check이면 저장된 파일과 다를 때 실패합니다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = new URL('../src/app/thirdPartyLicenses.json', import.meta.url);
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // pnpm은 Windows에서 .cmd라 셸을 거쳐야 실행됩니다(인자는 고정 문자열). cargo는 셸 없이 실행합니다.
    shell: command === 'pnpm' && process.platform === 'win32',
  });
const order = (a, b) =>
  a.name.localeCompare(b.name, 'en') ||
  a.version.localeCompare(b.version, 'en');

const npm = Object.values(
  JSON.parse(run('pnpm', ['licenses', 'list', '--prod', '--json'])),
)
  .flat()
  .flatMap((entry) =>
    entry.versions.map((version) => ({
      name: entry.name,
      version,
      license: entry.license || 'UNKNOWN',
    })),
  )
  .sort(order);

const cargo = [
  ...new Set(
    run('cargo', [
      'tree',
      '--locked',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      '-e',
      'normal,no-proc-macro',
      '--target',
      'x86_64-pc-windows-msvc',
      '--features',
      'custom-protocol',
      '--prefix',
      'none',
      '-f',
      '{p}|{l}',
    ])
      .split(/\r?\n/)
      .map((line) => line.replace(' (*)', '').trim())
      .filter(Boolean),
  ),
]
  .map((line) => {
    const [id, license = ''] = line.split('|');
    // "{이름} v{버전}" 뒤에 로컬 경로가 붙는 자체 crate는 아래에서 뺍니다.
    const [name, version] = id.split(' ');
    return {
      name,
      version: version.replace(/^v/, ''),
      license: license || 'UNKNOWN',
    };
  })
  .filter((item) => item.name !== 'guitarlab')
  .sort(order);

const text = `${JSON.stringify({ schemaVersion: 1, npm, cargo }, null, 2)}\n`;
if (process.argv.includes('--check')) {
  let saved = '';
  try {
    saved = readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    // 파일이 없으면 아래에서 오래된 목록으로 처리합니다.
  }
  if (saved !== text) {
    console.error(
      '의존성 고지 목록이 오래됨 · node scripts/third_party_notices.mjs 실행',
    );
    process.exit(1);
  }
} else {
  writeFileSync(target, text);
  console.log(`npm ${npm.length}개 · Rust ${cargo.length}개`);
}
