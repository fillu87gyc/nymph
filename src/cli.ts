#!/usr/bin/env bun
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';
import { createServer, initState } from './server.ts';

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
  const args = process.argv.slice(2);
  let paths: string[] = [];

  if (args.length > 0) {
    for (const a of args) {
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

  const port = await findPort();
  const server = createServer(port);

  const lockPath = paths.length > 0 ? `${paths[0]}.nymph-lock` : null;
  if (lockPath) writeFileSync(lockPath, String(port));

  const url = `http://localhost:${port}`;
  console.log(`nymph   ${url}`);
  if (paths.length > 0) console.log(`監視中  ${paths.join(', ')}`);
  else console.log('ファイルをブラウザにドロップして開始');
  console.log('Ctrl+C で停止');

  if (!process.env.NYMPH_NO_OPEN) {
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
