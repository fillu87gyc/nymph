import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeLockPath,
  delegateOpenFiles,
  fetchFrontendUrl,
  findExistingServer,
  probeNymphServer,
  readLockPort,
} from '../../src/instanceLock.ts';

// instanceLock は fetch() で HTTP 越しにやり取りするだけなので、
// テストダブルには vitest(node) でも動く node:http を使う
// （Bun.serve は vitest(node) では起動できない。server.test.ts 参照）。
function listen(
  handler: (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) => void,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolvePromise) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolvePromise({ server, port });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((r) => server.close(() => r()));
}

const TMP_DIR = join(tmpdir(), `nymph-instancelock-test-${process.pid}`);

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TMP_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
});

describe('computeLockPath', () => {
  it('ファイルパスがあれば先頭パスに .nymph-lock を付ける', () => {
    expect(computeLockPath(['/a/b.md', '/a/c.md'], null)).toBe(
      '/a/b.md.nymph-lock',
    );
  });

  it('ファイルパスが無く rootDir があれば rootDir 直下', () => {
    expect(computeLockPath([], '/a/root')).toBe('/a/root/.nymph-lock');
  });

  it('どちらも無ければ null', () => {
    expect(computeLockPath([], null)).toBeNull();
  });
});

describe('readLockPort', () => {
  it('ファイルが無ければ null', () => {
    expect(readLockPort(join(TMP_DIR, 'nope.nymph-lock'))).toBeNull();
  });

  it('有効なポート番号を読める', () => {
    const p = join(TMP_DIR, 'a.nymph-lock');
    writeFileSync(p, '6276');
    expect(readLockPort(p)).toBe(6276);
  });

  it('壊れた内容は null', () => {
    const p = join(TMP_DIR, 'broken.nymph-lock');
    writeFileSync(p, 'not-a-port');
    expect(readLockPort(p)).toBeNull();
  });

  it('範囲外のポート番号は null', () => {
    const p = join(TMP_DIR, 'oor.nymph-lock');
    writeFileSync(p, '99999');
    expect(readLockPort(p)).toBeNull();
  });
});

describe('probeNymphServer / findExistingServer', () => {
  it('nymph の /version 形状を返すサーバーは true', async () => {
    const { server, port } = await listen((req, res) => {
      if (req.url === '/version') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ nymph: true, version: 'x' }));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });
    try {
      expect(await probeNymphServer(port)).toBe(true);

      const lockPath = join(TMP_DIR, 'ok.nymph-lock');
      writeFileSync(lockPath, String(port));
      expect(await findExistingServer(lockPath)).toBe(port);
    } finally {
      await close(server);
    }
  });

  it('nymph のレスポンス形状ではないサーバー（別アプリ誤検出防止）は false', async () => {
    const { server, port } = await listen((req, res) => {
      if (req.url === '/version') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.end('hello from another app');
    });
    try {
      expect(await probeNymphServer(port)).toBe(false);

      const lockPath = join(TMP_DIR, 'other-app.nymph-lock');
      writeFileSync(lockPath, String(port));
      expect(await findExistingServer(lockPath)).toBeNull();
    } finally {
      await close(server);
    }
  });

  it('何も listen していないポートは false（stale ロック）', async () => {
    // 一度サーバーを立ててポート番号だけ確保し、即座に止めて空きポートにする
    const { server: probe, port: deadPort } = await listen((_req, res) =>
      res.end(),
    );
    await close(probe);

    expect(await probeNymphServer(deadPort, 300)).toBe(false);

    const lockPath = join(TMP_DIR, 'dead.nymph-lock');
    writeFileSync(lockPath, String(deadPort));
    expect(await findExistingServer(lockPath)).toBeNull();
  });

  it('lockPath が null なら null', async () => {
    expect(await findExistingServer(null)).toBeNull();
  });

  it('ロックファイルが存在しなければ null', async () => {
    expect(
      await findExistingServer(join(TMP_DIR, 'missing.nymph-lock')),
    ).toBeNull();
  });
});

describe('fetchFrontendUrl', () => {
  function versionServer(payload: unknown) {
    return listen((req, res) => {
      if (req.url === '/version') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });
  }

  it('/version が返すフロント URL を使う（dev の Vite dev server）', async () => {
    const { server, port } = await versionServer({
      nymph: true,
      version: 'x',
      frontendUrl: 'http://localhost:5173',
    });
    try {
      expect(await fetchFrontendUrl(port)).toBe('http://localhost:5173');
    } finally {
      await close(server);
    }
  });

  it('frontendUrl を返さない旧バージョンではバックエンドの URL に落とす', async () => {
    const { server, port } = await versionServer({ nymph: true, version: 'x' });
    try {
      expect(await fetchFrontendUrl(port)).toBe(`http://localhost:${port}`);
    } finally {
      await close(server);
    }
  });

  it('frontendUrl が不正な値ならバックエンドの URL に落とす', async () => {
    const { server, port } = await versionServer({
      nymph: true,
      frontendUrl: 'not a url',
    });
    try {
      expect(await fetchFrontendUrl(port)).toBe(`http://localhost:${port}`);
    } finally {
      await close(server);
    }
  });

  it('/version がエラーを返してもバックエンドの URL に落とす', async () => {
    const { server, port } = await listen((_req, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    try {
      expect(await fetchFrontendUrl(port)).toBe(`http://localhost:${port}`);
    } finally {
      await close(server);
    }
  });

  it('応答が無いポートでもバックエンドの URL に落とす', async () => {
    const { server: probe, port: deadPort } = await listen((_req, res) =>
      res.end(),
    );
    await close(probe);
    expect(await fetchFrontendUrl(deadPort, 300)).toBe(
      `http://localhost:${deadPort}`,
    );
  });
});

describe('delegateOpenFiles', () => {
  it('各パスに /open-file を POST し、最後に /active-file で先頭パスをアクティブにする', async () => {
    const received: { path: string; body: unknown }[] = [];
    const { server, port } = await listen((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (req.method === 'POST' && req.url === '/open-file') {
          received.push({ path: '/open-file', body: JSON.parse(body) });
        } else if (req.method === 'POST' && req.url === '/active-file') {
          received.push({ path: '/active-file', body: JSON.parse(body) });
        } else {
          res.statusCode = 404;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      });
    });
    try {
      await delegateOpenFiles(port, ['/a.md', '/b.md']);
      expect(received).toEqual([
        { path: '/open-file', body: { path: '/a.md' } },
        { path: '/open-file', body: { path: '/b.md' } },
        { path: '/active-file', body: { path: '/a.md' } },
      ]);
    } finally {
      await close(server);
    }
  });

  it('パスが空なら何もリクエストしない', async () => {
    let called = false;
    const { server, port } = await listen((_req, res) => {
      called = true;
      res.end();
    });
    try {
      await delegateOpenFiles(port, []);
      expect(called).toBe(false);
    } finally {
      await close(server);
    }
  });
});
