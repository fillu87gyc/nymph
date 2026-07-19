import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findAnyRunningInstance,
  getRegistryPath,
  registerInstance,
  unregisterInstance,
} from '../../src/instanceRegistry.ts';

// instanceLock.test.ts と同じ理由で node:http をテストダブルに使う
// （Bun.serve は vitest(node) では起動できない）。
function listen(nymph = true): Promise<{ server: Server; port: number }> {
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      if (req.url === '/version') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ nymph }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
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

const TMP_DIR = join(tmpdir(), `nymph-instanceregistry-test-${process.pid}`);
let prevXdg: string | undefined;

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  prevXdg = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = TMP_DIR;
});

afterEach(() => {
  if (prevXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = prevXdg;
  try {
    rmSync(TMP_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
});

describe('registerInstance / unregisterInstance', () => {
  it('登録したポートが findAnyRunningInstance で見つかる', async () => {
    const { server, port } = await listen();
    try {
      registerInstance(port);
      expect(await findAnyRunningInstance()).toBe(port);
    } finally {
      await close(server);
    }
  });

  it('unregisterInstance すると見つからなくなる', async () => {
    const { server, port } = await listen();
    try {
      registerInstance(port);
      unregisterInstance(port);
      expect(await findAnyRunningInstance()).toBeNull();
    } finally {
      await close(server);
    }
  });

  it('同じポートを二重登録しても1件のまま', async () => {
    const { server, port } = await listen();
    try {
      registerInstance(port);
      registerInstance(port);
      const raw = JSON.parse(readFileSync(getRegistryPath(), 'utf-8')) as {
        ports: number[];
      };
      expect(raw.ports).toEqual([port]);
    } finally {
      await close(server);
    }
  });
});

describe('findAnyRunningInstance', () => {
  it('レジストリが空なら null', async () => {
    expect(await findAnyRunningInstance()).toBeNull();
  });

  it('死んでいるポートは掃除して null を返す', async () => {
    const { server, port: deadPort } = await listen();
    await close(server);
    registerInstance(deadPort);

    expect(await findAnyRunningInstance()).toBeNull();

    const raw = JSON.parse(readFileSync(getRegistryPath(), 'utf-8')) as {
      ports: number[];
    };
    expect(raw.ports).toEqual([]);
  });

  it('nymph 以外のレスポンス形状のポートは無視する', async () => {
    const { server, port } = await listen(false);
    try {
      registerInstance(port);
      expect(await findAnyRunningInstance()).toBeNull();
    } finally {
      await close(server);
    }
  });

  it('複数登録されていれば生きているものを1つ返す', async () => {
    const dead = await listen();
    await close(dead.server);
    const alive = await listen();
    try {
      registerInstance(dead.port);
      registerInstance(alive.port);
      expect(await findAnyRunningInstance()).toBe(alive.port);
    } finally {
      await close(alive.server);
    }
  });
});
