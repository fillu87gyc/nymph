import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DictFile } from './schema.ts';
import type { NestedNode } from './tree.ts';

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
