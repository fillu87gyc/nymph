#!/usr/bin/env bun
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
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
  --export <出力先>    コメント埋め込みの静的 HTML を書き出して終了する
                       （サーバーは起動しない。ファイルを1つだけ指定する）
  --export-mermaid     エクスポートに Mermaid 描画エンジンを同梱する
                       （オフラインでも図が描画される。出力が約3MB増える）
  --annotate <出力先>  コメントを本文へ書き戻した Markdown を出力して終了する
                       （各ブロックの直後に「> [nymph] …」の引用を挿し込む。
                         元ファイルは書き換えない）
  --annotate-open      書き戻すコメントを未解決・削除済のみに絞る
  -v, --version        バージョンを表示して終了
  -h, --help           このヘルプを表示して終了

サブコマンド:
  nymph export <ファイル> [-o <出力先>] [--bom]
                       保存済みコメントを CSV にする（-o 省略で標準出力）
  nymph dict build     ユビキタス言語辞書をビルドする
  nymph dict allow     辞書設定に書かれたコマンドを承認する

例:
  nymph README.md
  nymph docs/*.md
  nymph ./docs
  nymph -p 8080 --no-open README.md
  nymph report.md --export review.html
  nymph report.md --export review.html --export-mermaid
  nymph report.md --annotate review.md
  nymph export report.md -o review.csv
`;

const EXPORT_HELP = `\
使い方: nymph export <ファイル> [オプション]

  保存済みのレビューコメントを CSV（RFC 4180・UTF-8）にする

オプション:
  -o, --out <出力先>   CSV の書き出し先（省略すると標準出力へ流す）
  --bom                先頭に UTF-8 BOM を付ける（Excel で開く場合）
  -h, --help           このヘルプを表示して終了

列:
  file, id, status, line_start, line_end, block_type, round,
  created_at, target, comment

例:
  nymph export report.md
  nymph export report.md -o review.csv
  nymph export report.md --bom -o review.csv
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

/** 出力サイズの案内用。同梱の有無で桁が変わるので単位を付けて出す。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

  // export サブコマンド処理（保存済みコメント → CSV）。
  // 起動オプションではなくサブコマンドにしてあるのは、これがレビュー対象を
  // 開く行為ではなく「溜まったデータを別形式で吐く」一発仕事のため。
  if (rawArgs[0] === 'export') {
    const subArgs = rawArgs.slice(1);
    let outPath: string | undefined;
    let bom = false;
    const targets: string[] = [];

    for (let i = 0; i < subArgs.length; i++) {
      const arg = subArgs[i];
      if (arg === '--out' || arg === '-o') {
        outPath = requireOptionValue(subArgs, ++i, arg);
      } else if (arg === '--bom') {
        bom = true;
      } else if (arg === '-h' || arg === '--help') {
        process.stdout.write(EXPORT_HELP);
        process.exit(0);
      } else if (arg.startsWith('-')) {
        console.error(`エラー: 不明なオプション: ${arg}`);
        console.error('  nymph export --help でヘルプを表示');
        process.exit(1);
      } else {
        targets.push(arg);
      }
    }

    if (targets.length !== 1) {
      console.error(
        targets.length === 0
          ? 'エラー: nymph export には対象の .md ファイルを1つ指定してください'
          : `エラー: nymph export で扱えるファイルは1つだけです（${targets.length} 個指定されました）`,
      );
      process.exit(1);
    }
    if (!existsSync(targets[0])) {
      console.error(`エラー: 指定されたパスが存在しません: ${targets[0]}`);
      process.exit(1);
    }

    const { exportCommentsCsv } = await import('./csvCommand.ts');
    try {
      const result = exportCommentsCsv(targets[0], { outPath, bom });
      if (result.outPath === null) {
        // 標準出力へ流すときは他に何も出さない（そのままパイプできるように）。
        // exit で切り落とされないよう、書き込みが済むまで待つ。
        await new Promise<void>((done) => {
          process.stdout.write(result.csv, () => done());
        });
      } else {
        console.log(`CSV           ${result.outPath}`);
        console.log(`元ファイル    ${result.file}`);
        console.log(`コメント      ${result.count} 件`);
      }
    } catch (err) {
      console.error(
        `エラー: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
    process.exit(0);
  }

  let portOverride: number | null = null;
  let noOpen = !!process.env.NYMPH_NO_OPEN;
  let exportPath: string | null = null;
  let embedMermaid = false;
  let annotatePath: string | null = null;
  let annotateOpenOnly = false;
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
    } else if (arg === '--export') {
      exportPath = requireOptionValue(rawArgs, ++i, arg);
    } else if (arg === '--export-mermaid') {
      embedMermaid = true;
    } else if (arg === '--annotate') {
      annotatePath = requireOptionValue(rawArgs, ++i, arg);
    } else if (arg === '--annotate-open') {
      annotateOpenOnly = true;
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

  // --export / --annotate は「書き出して終わる」一発仕事。サーバーも起動
  // しないし、既存インスタンスへの委譲にも乗せない（別プロセスに画面を
  // 開かせても出力ファイルは生まれないため）。
  if (exportPath === null && embedMermaid) {
    console.error(
      'エラー: --export-mermaid は --export と一緒に指定してください',
    );
    process.exit(1);
  }
  if (annotatePath === null && annotateOpenOnly) {
    console.error(
      'エラー: --annotate-open は --annotate と一緒に指定してください',
    );
    process.exit(1);
  }
  // 1 回の実行で出力は 1 つに絞る。どちらの結果を報告しているのか
  // （どちらが失敗したのか）を混ぜないため。
  if (exportPath !== null && annotatePath !== null) {
    console.error('エラー: --export と --annotate は同時に指定できません');
    process.exit(1);
  }

  if (annotatePath !== null) {
    if (paths.length !== 1) {
      console.error(
        paths.length === 0
          ? 'エラー: --annotate には書き戻す .md ファイルを1つ指定してください'
          : `エラー: --annotate で扱えるファイルは1つだけです（${paths.length} 個指定されました）`,
      );
      process.exit(1);
    }
    const { annotateToFile } = await import('./annotateCommand.ts');
    try {
      const result = annotateToFile(paths[0], annotatePath, {
        includeResolved: !annotateOpenOnly,
      });
      console.log(`書き戻し      ${result.outPath}`);
      console.log(`元ファイル    ${result.file}`);
      console.log(
        `コメント      ${result.written} 件（未解決 ${result.counts.open} / 削除済 ${result.counts.deleted} / 解決済 ${result.counts.resolved}）`,
      );
      if (result.skipped > 0)
        console.log(`除外          解決済 ${result.skipped} 件`);
    } catch (err) {
      console.error(
        `エラー: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
    process.exit(0);
  }

  if (exportPath !== null) {
    if (paths.length !== 1) {
      console.error(
        paths.length === 0
          ? 'エラー: --export にはエクスポートする .md ファイルを1つ指定してください'
          : `エラー: --export で扱えるファイルは1つだけです（${paths.length} 個指定されました）`,
      );
      process.exit(1);
    }
    const { exportToFile } = await import('./exportCommand.ts');
    try {
      const result = exportToFile(paths[0], exportPath, { embedMermaid });
      console.log(`エクスポート  ${result.outPath}`);
      console.log(`元ファイル    ${result.file}`);
      console.log(`コメント      ${result.commentCount} 件`);
      console.log(`サイズ        ${formatBytes(result.bytes)}`);
    } catch (err) {
      console.error(
        `エラー: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
    process.exit(0);
  }

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
