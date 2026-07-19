import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { probeNymphServer } from './instanceLock.ts';

/**
 * 実行中の nymph インスタンス（ポート番号）のレジストリ。
 *
 * `instanceLock.ts` のロックファイルはあくまで「今回指定したファイル/ルートと
 * 完全一致するインスタンス」しか見つけられない。`nymph a.md` 起動中に
 * `nymph b.md`（無関係な別ファイル）を実行したケースでも新規プロセスを
 * 増やさずに済むよう、生きている nymph インスタンスを横断的に探すために使う。
 *
 * recent.json と同じく XDG_DATA_HOME（~/.local/share/nymph）に保存する。
 */

interface RegistryJson {
  version: 1;
  ports: number[];
}

export function getRegistryPath(): string {
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, 'nymph', 'instances.json');
}

function loadPorts(): number[] {
  try {
    const path = getRegistryPath();
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as RegistryJson;
    if (Array.isArray(parsed?.ports)) return parsed.ports;
  } catch {
    // ファイル破損や読み取りエラーは無視して空扱いにする
  }
  return [];
}

function savePorts(ports: number[]): void {
  const path = getRegistryPath();
  mkdirSync(dirname(path), { recursive: true });
  const data: RegistryJson = { version: 1, ports };
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 起動したインスタンスのポートをレジストリに登録する */
export function registerInstance(port: number): void {
  const ports = loadPorts().filter((p) => p !== port);
  ports.push(port);
  savePorts(ports);
}

/** 終了したインスタンスのポートをレジストリから外す */
export function unregisterInstance(port: number): void {
  savePorts(loadPorts().filter((p) => p !== port));
}

/**
 * レジストリ上で実際に生きている（/version が応答する）nymph インスタンスを
 * 1つ探す。見つからなければ null。ついでに死んでいるポートをレジストリから
 * 掃除する。
 */
export async function findAnyRunningInstance(): Promise<number | null> {
  const ports = loadPorts();
  if (ports.length === 0) return null;

  const alive: number[] = [];
  for (const port of ports) {
    if (await probeNymphServer(port)) alive.push(port);
  }
  if (alive.length !== ports.length) savePorts(alive);
  return alive.length > 0 ? alive[0] : null;
}
