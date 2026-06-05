#!/usr/bin/env bun
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';
import { createServer, initState, SERVER_HOSTNAME } from './server.ts';

const VERSION = '1.0.0';

const HELP = `\
使い方: nymph [オプション] [ファイル ...]

  Markdown レビューツール — ホットリロードとインラインコメント付き

引数:
  ファイル ...          監視する .md ファイル（glob 対応）

オプション:
  -p, --port <番号>    使用するポート番号 (デフォルト: 6276)
  --no-open            ブラウザを自動的に開かない
  -v, --version        バージョンを表示して終了
  -h, --help           このヘルプを表示して終了

例:
  nymph README.md
  nymph docs/*.md
  nymph -p 8080 --no-open README.md
`;

async function findPort(start = 6276): Promise<number> {
  for (let port = start; port < start + 20; port++) {
    try {
      const test = Bun.serve({
        port,
        hostname: SERVER_HOSTNAME,
        fetch: () => new Response(),
      });
      await test.stop(true);
      return port;
    } catch {
      /* port in use */
    }
  }
  return start;
}

async function main() {
  const rawArgs = process.argv.slice(2);

  // dict サブコマンド処理
  if (rawArgs[0] === 'dict') {
    const subArgs = rawArgs.slice(1);

    if (subArgs[0] === 'allow') {
      // nymph dict allow — config.yml のコマンドを承認する（direnv allow 相当）
      let configPath = '.nymph/config.yml';
      for (let i = 1; i < subArgs.length; i++) {
        if (subArgs[i] === '--config' || subArgs[i] === '-c') {
          configPath = subArgs[++i];
        }
      }
      try {
        const { loadConfig } = await import('./dict/config.ts');
        const { computeCommandsHash, saveAcceptedHash } = await import(
          './dict/consent.ts'
        );
        const { createInterface } = await import('node:readline');

        const config = loadConfig(configPath);
        console.log(`\n${configPath} に含まれるコマンド:\n`);
        for (const source of config.sources) {
          console.log(`  [${source.name}]  ${source.fetch.cmd.join(' ')}`);
        }
        console.log();

        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer = await new Promise<string>((resolve) => {
          rl.question('これらのコマンドを承認しますか? [y/N] ', (ans) => {
            rl.close();
            resolve(ans.trim());
          });
        });

        if (!['y', 'yes'].includes(answer.toLowerCase())) {
          console.log('キャンセルしました。');
          process.exit(0);
        }

        saveAcceptedHash(computeCommandsHash(config));
        console.log('承認しました。nymph dict build を実行できます。');
      } catch (err) {
        console.error(
          `エラー: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
      process.exit(0);
    }

    if (subArgs[0] === 'build') {
      const { buildDict } = await import('./dict/build.ts');
      const { loadConfig } = await import('./dict/config.ts');
      const { computeCommandsHash, isCommandHashAccepted } = await import(
        './dict/consent.ts'
      );
      let configPath = '.nymph/config.yml';
      let outPath: string | undefined;
      let debug = false;
      let debugDir: string | undefined;

      for (let i = 1; i < subArgs.length; i++) {
        const arg = subArgs[i];
        if (arg === '--config' || arg === '-c') {
          configPath = subArgs[++i];
        } else if (arg === '--out' || arg === '-o') {
          outPath = subArgs[++i];
        } else if (arg === '--debug') {
          debug = true;
        } else if (arg === '--debug-dir') {
          debugDir = subArgs[++i];
        }
      }

      try {
        // コマンド承認チェック
        const config = loadConfig(configPath);
        const hash = computeCommandsHash(config);
        if (!isCommandHashAccepted(hash)) {
          console.error(`エラー: ${configPath} のコマンドは未承認です。\n`);
          for (const source of config.sources) {
            console.error(`  [${source.name}]  ${source.fetch.cmd.join(' ')}`);
          }
          console.error(`\n承認するには: nymph dict allow`);
          process.exit(1);
        }

        const result = await buildDict({
          configPath,
          outPath,
          debug,
          debugDir,
        });
        console.log(`dict build 完了: ${result.entries.length} エントリ`);
      } catch (err) {
        console.error(
          `エラー: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    } else {
      console.error(`エラー: 不明な dict サブコマンド: ${subArgs[0] ?? ''}`);
      console.error('  使用可能: nymph dict build, nymph dict allow');
      process.exit(1);
    }
    process.exit(0);
  }

  let paths: string[] = [];
  let portOverride: number | null = null;
  let noOpen = !!process.env.NYMPH_NO_OPEN;
  const fileArgs: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '-v' || arg === '--version') {
      console.log(VERSION);
      process.exit(0);
    }
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(HELP);
      process.exit(0);
    }
    if (arg === '--no-open') {
      noOpen = true;
    } else if (arg === '-p' || arg === '--port') {
      const next = rawArgs[++i];
      const n = Number(next);
      if (!next || Number.isNaN(n) || n < 1 || n > 65535) {
        console.error(`エラー: --port には有効なポート番号を指定してください`);
        process.exit(1);
      }
      portOverride = n;
    } else if (arg.startsWith('-')) {
      console.error(`エラー: 不明なオプション: ${arg}`);
      console.error('  nymph --help でヘルプを表示');
      process.exit(1);
    } else {
      fileArgs.push(arg);
    }
  }

  if (fileArgs.length > 0) {
    for (const filePath of fileArgs) {
      const abs = resolve(filePath);
      if (existsSync(abs) && abs.endsWith('.md')) {
        paths.push(abs);
      } else {
        // already-expanded glob from shell or directory
        const glob = new Glob(filePath);
        const expanded: string[] = [];
        for await (const f of glob.scan('.')) {
          if (f.endsWith('.md')) expanded.push(resolve(f));
        }
        if (expanded.length > 0) paths.push(...expanded.sort());
        else if (!paths.length) {
          const single = resolve(filePath);
          if (existsSync(single)) paths.push(single);
        }
      }
    }
    paths = [...new Set(paths)].filter((p) => existsSync(p));
    if (paths.length === 0) {
      console.error('エラー: Markdownファイルが見つかりません');
      process.exit(1);
    }
  }

  initState(paths);

  const port = portOverride ?? (await findPort());
  const server = createServer(port);

  const lockPath = paths.length > 0 ? `${paths[0]}.nymph-lock` : null;
  if (lockPath) writeFileSync(lockPath, String(port));

  const url = `http://localhost:${port}`;
  console.log(`nymph   ${url}`);
  if (paths.length > 0) console.log(`監視中  ${paths.join(', ')}`);
  else console.log('ファイルをブラウザにドロップして開始');
  console.log('Ctrl+C で停止');

  if (!noOpen) {
    setTimeout(async () => {
      const { default: open } = await import('open');
      open(url);
    }, 300);
  }

  process.on('SIGINT', () => {
    if (lockPath) {
      try {
        unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }
    server.stop();
    console.log('\n停止しました。');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    if (lockPath) {
      try {
        unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }
    server.stop();
    process.exit(0);
  });
}

main();
