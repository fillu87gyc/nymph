import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadConfig } from './config.ts';
import { getAdapter } from './adapter.ts';
import { buildTree } from './tree.ts';
import { select, selectRelative } from './selector.ts';
import { writeDictFile, writeRawCache, writeDebugArtifacts } from './cache.ts';
import type { DictFile, DictEntry } from './schema.ts';

// Side-effect import to register the markdown adapter
import './adapters/markdown.ts';

export interface BuildOptions {
  configPath: string;
  outPath?: string;
  debug?: boolean;
  debugDir?: string;
  cwd?: string;
}

export async function buildDict(options: BuildOptions): Promise<DictFile> {
  const { configPath, debug = false } = options;
  const cwd = options.cwd ?? process.cwd();

  const config = loadConfig(configPath);

  const outPath =
    options.outPath ?? config.dict?.out ?? join(cwd, '.nymph/dict.json');
  const debugDir = options.debugDir ?? join(cwd, '.nymph/debug');
  const rawCacheDir = join(cwd, '.nymph/raw');

  const allEntries: DictEntry[] = [];

  for (const source of config.sources) {
    const { cmd } = source.fetch;
    if (!cmd || cmd.length === 0) {
      throw new Error(`source "${source.name}": fetch.cmd が空です`);
    }

    // Execute with shell:false for security
    const result = spawnSync(cmd[0], cmd.slice(1), {
      shell: false,
      encoding: 'utf-8',
      cwd,
    });

    if (result.error) {
      throw new Error(
        `source "${source.name}": コマンド実行エラー: ${result.error.message}`,
      );
    }
    if (result.status !== 0) {
      throw new Error(
        `source "${source.name}": コマンドが終了コード ${result.status} で終了しました。stderr: ${result.stderr}`,
      );
    }

    const raw = result.stdout;

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
