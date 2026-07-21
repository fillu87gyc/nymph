import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flattenMdFiles, scanMdTree, type TreeNode } from '../../src/fsTree.ts';

const ROOT = join(tmpdir(), `nymph-fstree-test-${process.pid}`);

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'sub', 'deep'), { recursive: true });
  mkdirSync(join(ROOT, '.hidden'), { recursive: true });
  mkdirSync(join(ROOT, 'node_modules', 'pkg'), { recursive: true });
  mkdirSync(join(ROOT, 'empty-dir'), { recursive: true });
  writeFileSync(join(ROOT, 'b.md'), '# b');
  writeFileSync(join(ROOT, 'a.md'), '# a');
  writeFileSync(join(ROOT, 'sub', 'c.md'), '# c');
  writeFileSync(join(ROOT, 'sub', 'deep', 'd.md'), '# d');
  writeFileSync(join(ROOT, 'sub', 'notes.txt'), 'not md');
  writeFileSync(join(ROOT, '.hidden', 'x.md'), '# x');
  writeFileSync(join(ROOT, 'node_modules', 'pkg', 'y.md'), '# y');
});

afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function names(nodes: TreeNode[]): string[] {
  return nodes.map((n) => n.name);
}

describe('scanMdTree', () => {
  it('階層構造を維持して .md を列挙する（dir 先行・アルファベット順）', () => {
    const tree = scanMdTree(ROOT);
    expect(names(tree)).toEqual(['sub', 'a.md', 'b.md']);
    const sub = tree[0];
    expect(sub.type).toBe('dir');
    expect(names(sub.children ?? [])).toEqual(['deep', 'c.md']);
    const deep = (sub.children ?? [])[0];
    expect(names(deep.children ?? [])).toEqual(['d.md']);
  });

  it('path は絶対パスになっている', () => {
    const tree = scanMdTree(ROOT);
    const a = tree.find((n) => n.name === 'a.md');
    expect(a?.path).toBe(join(ROOT, 'a.md'));
    const sub = tree.find((n) => n.name === 'sub');
    expect(sub?.path).toBe(join(ROOT, 'sub'));
  });

  it('隠しディレクトリと node_modules を除外する', () => {
    const tree = scanMdTree(ROOT);
    expect(names(tree)).not.toContain('.hidden');
    expect(names(tree)).not.toContain('node_modules');
  });

  it('.md を含まないディレクトリは刈り取られる', () => {
    const tree = scanMdTree(ROOT);
    expect(names(tree)).not.toContain('empty-dir');
  });

  it('.md 以外のファイルは出てこない', () => {
    const tree = scanMdTree(ROOT);
    const sub = tree.find((n) => n.name === 'sub');
    expect(names(sub?.children ?? [])).not.toContain('notes.txt');
  });

  it('symlink のディレクトリは辿らない（循環防止）', () => {
    symlinkSync(ROOT, join(ROOT, 'sub', 'loop'));
    const tree = scanMdTree(ROOT);
    const sub = tree.find((n) => n.name === 'sub');
    expect(names(sub?.children ?? [])).not.toContain('loop');
  });

  it('存在しない root は空配列（throw しない）', () => {
    expect(scanMdTree(join(ROOT, 'nope'))).toEqual([]);
  });

  it('.md が 1 つもない root は空配列', () => {
    expect(scanMdTree(join(ROOT, 'empty-dir'))).toEqual([]);
  });
});

describe('flattenMdFiles', () => {
  it('ネストしたツリーから .md のパスだけを平坦化する', () => {
    const paths = flattenMdFiles(scanMdTree(ROOT));
    expect(paths).toEqual([
      join(ROOT, 'sub', 'deep', 'd.md'),
      join(ROOT, 'sub', 'c.md'),
      join(ROOT, 'a.md'),
      join(ROOT, 'b.md'),
    ]);
  });

  it('空ツリーは空配列', () => {
    expect(flattenMdFiles([])).toEqual([]);
  });
});
