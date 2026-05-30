#!/usr/bin/env bun
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';
import { createServer, initState } from './server.ts';

const VERSION = '0.1.0';

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
      const test = Bun.serve({ port, fetch: () => new Response() });
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
  let paths: string[] = [];
  let portOverride: number | null = null;
  let noOpen = !!process.env.NYMPH_NO_OPEN;
  const fileArgs: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '-v' || a === '--version') {
      console.log(VERSION);
      process.exit(0);
    }
    if (a === '-h' || a === '--help') {
      process.stdout.write(HELP);
      process.exit(0);
    }
    if (a === '--no-open') {
      noOpen = true;
    } else if (a === '-p' || a === '--port') {
      const next = rawArgs[++i];
      const n = Number(next);
      if (!next || Number.isNaN(n) || n < 1 || n > 65535) {
        console.error(`エラー: --port には有効なポート番号を指定してください`);
        process.exit(1);
      }
      portOverride = n;
    } else if (a.startsWith('-')) {
      console.error(`エラー: 不明なオプション: ${a}`);
      console.error('  nymph --help でヘルプを表示');
      process.exit(1);
    } else {
      fileArgs.push(a);
    }
  }

  if (fileArgs.length > 0) {
    for (const a of fileArgs) {
      const abs = resolve(a);
      if (existsSync(abs) && abs.endsWith('.md')) {
        paths.push(abs);
      } else {
        // already-expanded glob from shell or directory
        const glob = new Glob(a);
        const expanded: string[] = [];
        for await (const f of glob.scan('.')) {
          if (f.endsWith('.md')) expanded.push(resolve(f));
        }
        if (expanded.length > 0) paths.push(...expanded.sort());
        else if (!paths.length) {
          const single = resolve(a);
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
