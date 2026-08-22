import * as cp from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAdapter } from './adapter.ts';
import {
  isStale,
  readDictFile,
  writeDebugArtifacts,
  writeDictFile,
  writeRawCache,
} from './cache.ts';
import { loadConfig } from './config.ts';
import type { DictEntry, DictFile } from './schema.ts';
import { select, selectRelative } from './selector.ts';
import { buildTree } from './tree.ts';

// Side-effect imports to register adapters
import './adapters/markdown.ts';
import './adapters/json.ts';

export interface BuildOptions {
  configPath: string;
  outPath?: string;
  debug?: boolean;
  debugDir?: string;
  cwd?: string;
  /** true かつ fresh な dict.json があれば既存 dict.json をそのまま返す（デフォルト false） */
  skipIfFresh?: boolean;
}

/**
 * 引数リストに glob パターン（* や ?）が含まれる場合に Bun.Glob で展開する。
 * cmd[0] 自体は展開しない。
 */
function expandGlobArgs(args: string[], cwd: string): string[] {
  const expanded: string[] = [];
  for (const arg of args) {
    if (arg.includes('*') || arg.includes('?')) {
      const glob = new Bun.Glob(arg);
      const matches = [...glob.scanSync({ cwd, absolute: false })].sort();
      expanded.push(...matches);
    } else {
      expanded.push(arg);
    }
  }
  return expanded;
}

/**
 * 外部コマンドへ渡してよい環境変数の名前。
 *
 * `.nymph/config.yml` はレビュー対象リポジトリが書ける内容であり、そこに
 * 書かれたコマンドは nymph が spawn する。既定の spawn は `process.env` を
 * 丸ごと継承するため、そのままでは `GH_TOKEN` / `AWS_*` / `SSH_AUTH_SOCK`
 * といった資格情報が外部コマンドに渡る（`gh auth token` を叩かれる余地も
 * 同じ）。「nymph 自身はトークンを持たない」ことと「子プロセスにトークンが
 * 渡らない」ことは別問題なので、渡すものを allowlist で決める。
 *
 * ここに入っているのはコマンドが動くために要るものだけ——実行ファイルの探索
 * （PATH ほか）、ホーム、ロケール、一時ディレクトリ。
 */
const SPAWN_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  // Windows で実行ファイル探索・一時ディレクトリに要るもの
  'APPDATA',
  'COMSPEC',
  'LOCALAPPDATA',
  'PATHEXT',
  'SystemDrive',
  'SystemRoot',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'windir',
] as const;

/** allowlist に載っている環境変数だけを取り出す（未定義のキーは落とす）。 */
export function spawnEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SPAWN_ENV_ALLOWLIST) {
    const value = env[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * spawnSync の結果を検証し、エラーの場合は例外をスローする。
 */
function assertSpawnResult(
  result: { error?: Error; status: number | null; stderr: string },
  sourceName: string,
): void {
  if (result.error) {
    throw new Error(
      `source "${sourceName}": コマンド実行エラー: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `source "${sourceName}": コマンドが終了コード ${result.status} で終了しました。stderr: ${result.stderr}`,
    );
  }
}

export async function buildDict(options: BuildOptions): Promise<DictFile> {
  const { configPath, debug = false, skipIfFresh = false } = options;
  const cwd = options.cwd ?? process.cwd();

  const config = loadConfig(configPath);

  const outPath =
    options.outPath ?? config.dict?.out ?? join(cwd, '.nymph/dict.json');
  const debugDir = options.debugDir ?? join(cwd, '.nymph/debug');
  const rawCacheDir = join(cwd, '.nymph/raw');

  // TTL スキップ: skipIfFresh=true かつ dict.json が fresh なら early return
  if (skipIfFresh && existsSync(outPath)) {
    const existing = readDictFile(outPath);
    if (existing && !isStale(existing, { ttl: config.dict?.ttl })) {
      return existing;
    }
  }

  const allEntries: DictEntry[] = [];

  for (const source of config.sources) {
    const { cmd } = source.fetch;
    if (!cmd || cmd.length === 0) {
      throw new Error(`source "${source.name}": fetch.cmd が空です`);
    }

    const baseArgs = cmd.slice(1);
    const hasGlob = baseArgs.some((a) => a.includes('*') || a.includes('?'));

    let raw: string;

    if (hasGlob) {
      // glob 展開: 展開されたファイルごとにコマンドを個別実行して raw を結合
      const expandedArgs = expandGlobArgs(baseArgs, cwd);
      if (expandedArgs.length === 0) {
        throw new Error(
          `source "${source.name}": glob パターンに一致するファイルが見つかりません`,
        );
      }
      const rawParts: string[] = [];
      for (const file of expandedArgs) {
        const result = cp.spawnSync(cmd[0], [file], {
          shell: false,
          encoding: 'utf-8',
          cwd,
          env: spawnEnv(),
        });
        assertSpawnResult(result, source.name);
        rawParts.push(result.stdout);
      }
      raw = rawParts.join('\n');
    } else {
      // Execute with shell:false for security
      const result = cp.spawnSync(cmd[0], baseArgs, {
        shell: false,
        encoding: 'utf-8',
        cwd,
        env: spawnEnv(),
      });
      assertSpawnResult(result, source.name);
      raw = result.stdout;
    }

    if (debug) {
      writeRawCache(rawCacheDir, source.name, raw);
    }

    const adapter = getAdapter(source.adapter);
    const tree = buildTree(raw);

    // Build match data for debug artifacts
    let entries: DictEntry[];
    if (debug) {
      const termNodes = select(tree, source.rules.term);
      const matchData = termNodes.map((termNode) => ({
        term: termNode,
        // Pass tree roots so ~ and + work for root-level term nodes
        definitions: selectRelative(termNode, source.rules.definition, tree),
      }));
      writeDebugArtifacts(debugDir, source.name, tree, matchData);
      entries = adapter.extract(raw, source.rules);
    } else {
      entries = adapter.extract(raw, source.rules);
    }

    // Fill source metadata
    for (const entry of entries) {
      entry.source = source.name;
    }

    allEntries.push(...entries);
  }

  const dictFile: DictFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: allEntries,
  };

  writeDictFile(outPath, dictFile);

  return dictFile;
}
