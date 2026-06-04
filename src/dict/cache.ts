import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DictFile } from './schema.ts';
import type { NestedNode } from './tree.ts';

export interface StalenessConfig {
  ttl?: string; // "24h", "1h", "30m"
}

const DEFAULT_TTL_MS = 86400000; // 24h

/**
 * TTL 文字列をミリ秒に変換する。
 * 対応形式: "24h", "1h", "30m" など（正の整数 + h/m）
 * 不正形式・0値はデフォルト 86400000ms を返す。
 */
export function parseTtl(ttl: string): number {
  const match = /^(\d+)([hm])$/.exec(ttl);
  if (!match) return DEFAULT_TTL_MS;
  const value = Number(match[1]);
  // 0 は意味のない TTL なのでデフォルトにフォールバック
  if (value === 0) return DEFAULT_TTL_MS;
  const unit = match[2];
  if (unit === 'h') return value * 3600 * 1000;
  return value * 60 * 1000;
}

/**
 * dict.json が stale かどうか判定する。
 * - updatedAt が空文字または不正な日付文字列の場合は常に true
 * - ttl 省略時は 24h 扱い
 */
export function isStale(dictFile: DictFile, config: StalenessConfig): boolean {
  if (!dictFile.updatedAt) return true;
  const ts = new Date(dictFile.updatedAt).getTime();
  // 不正な日付文字列の場合は NaN になるので stale 扱い
  if (Number.isNaN(ts)) return true;
  const ttlMs = config.ttl ? parseTtl(config.ttl) : DEFAULT_TTL_MS;
  const age = Date.now() - ts;
  return age >= ttlMs;
}

export function readDictFile(outPath: string): DictFile | null {
  if (!existsSync(outPath)) return null;
  try {
    const text = readFileSync(outPath, 'utf-8');
    return JSON.parse(text) as DictFile;
  } catch {
    return null;
  }
}

export function writeDictFile(outPath: string, data: DictFile): void {
  mkdirSync(dirname(outPath), { recursive: true });
  // Serialize without parent references to avoid circular JSON
  writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
}

export function writeRawCache(
  cacheDir: string,
  name: string,
  raw: string,
): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, `${name}.txt`), raw, 'utf-8');
}

// Strip parent refs before serializing to avoid circular structure
function stripParent(nodes: NestedNode[]): object[] {
  return nodes.map((n) => ({
    type: n.type,
    text: n.text,
    raw: n.raw,
    html: n.html,
    depth: n.depth,
    line: n.line,
    children: stripParent(n.children),
  }));
}

export function writeDebugArtifacts(
  debugDir: string,
  name: string,
  tree: NestedNode[],
  matches: Array<{ term: NestedNode; definitions: NestedNode[] }>,
): void {
  const treeDir = join(debugDir, 'tree');
  const matchDir = join(debugDir, 'match');
  mkdirSync(treeDir, { recursive: true });
  mkdirSync(matchDir, { recursive: true });

  writeFileSync(
    join(treeDir, `${name}.json`),
    JSON.stringify(stripParent(tree), null, 2),
    'utf-8',
  );

  const matchData = matches.map((m) => ({
    term: { type: m.term.type, text: m.term.text },
    definitions: stripParent(m.definitions),
  }));
  writeFileSync(
    join(matchDir, `${name}.json`),
    JSON.stringify(matchData, null, 2),
    'utf-8',
  );
}
