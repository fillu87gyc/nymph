#!/usr/bin/env bun
import { unlinkSync, writeFileSync } from 'node:fs';
import { backendUrl, resolveFrontendUrl } from './frontendUrl.ts';
import { globScan } from './globScan.ts';
import {
  computeLockPath,
  delegateOpenFiles,
  fetchFrontendUrl,
  findExistingServer,
} from './instanceLock.ts';
import {
  findAnyRunningInstance,
  registerInstance,
  unregisterInstance,
} from './instanceRegistry.ts';
import { resolvePortOverride } from './portUtils.ts';
import { recordRecent } from './recent.ts';
import { resolveInputs } from './resolveInputs.ts';
import { createServer, initState, SERVER_HOSTNAME } from './server.ts';

const VERSION = '1.0.0';

const HELP = `\
使い方: nymph [オプション] [ファイル|ディレクトリ ...]

  Markdown レビューツール — ホットリロードとインラインコメント付き

引数:
  ファイル ...          監視する .md ファイル（glob 対応）
  ディレクトリ          サイドバーにツリー表示して .md を開けるようにする

オプション:
  -p, --port <番号>    使用するポート番号 (デフォルト: 6276)
  --no-open            ブラウザを自動的に開かない
  -v, --version        バージョンを表示して終了
  -h, --help           このヘルプを表示して終了

例:
  nymph README.md
  nymph docs/*.md
  nymph ./docs
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

/**
 * `--config <値>` のような値付きオプションの値を読む。
 * 値が無いまま次のオプションや行末に来たら、undefined を持ち回らずここで落とす。
 */
function requireOptionValue(
  args: string[],
  index: number,
  flag: string,
): string {
  const value = args[index];
  if (value === undefined || value.startsWith('-')) {
    console.error(`エラー: ${flag} には値を指定してください`);
    process.exit(1);
  }
  return value;
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
        const arg = subArgs[i];
        if (arg === '--config' || arg === '-c') {
          configPath = requireOptionValue(subArgs, ++i, arg);
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
          configPath = requireOptionValue(subArgs, ++i, arg);
        } else if (arg === '--out' || arg === '-o') {
          outPath = requireOptionValue(subArgs, ++i, arg);
        } else if (arg === '--debug') {
          debug = true;
        } else if (arg === '--debug-dir') {
          debugDir = requireOptionValue(subArgs, ++i, arg);
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

  const { paths, dirs, missing } = await resolveInputs(fileArgs, {
    scan: globScan,
  });

  // 存在しないファイル/ディレクトリを指定されたら、サーバを起動する前に落とす。
  // 一部だけ存在するケース（nymph README.md typo.md）も黙って無視せずエラーにする。
  if (missing.length > 0) {
    for (const arg of missing) {
      console.error(`エラー: 指定されたパスが存在しません: ${arg}`);
    }
    console.error('  nymph --help でヘルプを表示');
    process.exit(1);
  }
  if (dirs.length > 1) {
    console.error('エラー: ディレクトリは1つだけ指定できます');
    process.exit(1);
  }
  const rootDir: string | null = dirs[0] ?? null;

  // 既に同じファイル/ルートを開いている生きた nymph インスタンスがあれば、
  // 新規プロセス・新規ポートを起動せずそちらへ委譲する
  // （nymph <file> / nymphx <file> を同じファイルに対して再実行したケース）。
  const lockPath = computeLockPath(paths, rootDir);
  let existingPort: number | null = null;
  let rewriteLock = false;
  if (lockPath) {
    existingPort = await findExistingServer(lockPath);
  }
  if (existingPort === null && paths.length > 0) {
    // ロックと一致しなくても、他に生きている nymph インスタンスがあれば
    // 新規プロセスを増やさずそちらの開いているファイル一覧に追加する
    // （nymph a.md を起動中に無関係な nymph b.md を実行したケース）。
    existingPort = await findAnyRunningInstance();
    rewriteLock = existingPort !== null;
  }
  if (existingPort !== null) {
    // /open-file の許可チェック（isRecentPath 等）を通すため委譲前に記録する
    recordRecent(paths);
    await delegateOpenFiles(existingPort, paths);
    // レジストリ経由で見つけた別インスタンスの場合、次回同じファイルを
    // 指定したときにロック一致で直接見つけられるようロックを書いておく
    // （lockPath 一致で委譲した場合は既に正しい値なので上書きしない）。
    if (rewriteLock && lockPath) {
      try {
        writeFileSync(lockPath, String(existingPort));
      } catch {
        /* ignore */
      }
    }

    // 既存インスタンスのフロント URL（dev では Vite の URL）を案内する。
    // バックエンドのポートを出しても、そこでは開発中の画面は配られていない。
    const existingUrl = await fetchFrontendUrl(existingPort);
    const existingApiUrl = backendUrl(existingPort);
    console.log(`nymph   既存のインスタンスで開きます   ${existingUrl}`);
    if (existingUrl !== existingApiUrl)
      console.log(`API     ${existingApiUrl}`);
    if (paths.length > 0) console.log(`開いた  ${paths.join(', ')}`);

    if (!noOpen) {
      const { default: open } = await import('open');
      await open(existingUrl);
    }
    process.exit(0);
  }

  recordRecent(paths);
  initState(paths, rootDir);

  const port =
    resolvePortOverride(portOverride, process.env.NYMPH_PORT) ??
    (await findPort());
  const server = createServer(port);

  if (lockPath) writeFileSync(lockPath, String(port));
  registerInstance(port);

  const url = resolveFrontendUrl(port, process.env.NYMPH_FRONTEND_URL);
  const apiUrl = backendUrl(port);
  console.log(`nymph   ${url}`);
  if (url !== apiUrl) console.log(`API     ${apiUrl}`);
  if (rootDir) console.log(`ルート  ${rootDir}`);
  if (paths.length > 0) console.log(`監視中  ${paths.join(', ')}`);
  else if (!rootDir) console.log('ファイルをブラウザにドロップして開始');
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
    unregisterInstance(port);
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
    unregisterInstance(port);
    server.stop();
    process.exit(0);
  });
}

main();
