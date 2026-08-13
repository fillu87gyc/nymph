/**
 * `nymph --version` / `-v` の E2E。
 *
 * 見張っているのは「表示されるバージョンが package.json ひとつから来ている」
 * こと。以前は cli.ts に `const VERSION = '1.0.0'` を直書きしていて、
 * リリース時に package.json だけが更新されていたため、1.0.2〜1.1.1 の
 * どれをインストールしても `-v` は 1.0.0 を返していた。
 *
 * package.json を読んで突き合わせるので、誰かが再び数値を直書きしても
 * 次のバージョン更新の時点でこのテストが落ちる。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const NYMPH_ROOT = process.cwd();

const pkgVersion: string = JSON.parse(
  readFileSync(join(NYMPH_ROOT, 'package.json'), 'utf-8'),
).version;

function runCli(args: string[]) {
  return spawnSync('bun', ['src/cli.ts', ...args], {
    cwd: NYMPH_ROOT,
    encoding: 'utf-8',
    timeout: 30000,
  });
}

test('package.json が semver を持っている', () => {
  expect(pkgVersion).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
});

for (const flag of ['--version', '-v']) {
  test(`nymph ${flag} が package.json のバージョンを返す`, () => {
    const res = runCli([flag]);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe(pkgVersion);
  });
}

test('nymph --version はサーバーを起動せず終了する', () => {
  const res = runCli(['--version']);
  expect(res.status).toBe(0);
  // 起動していれば「nymph http://localhost:...」の案内が出るはず
  expect(res.stdout).not.toContain('http://');
});
