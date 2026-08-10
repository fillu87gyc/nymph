import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { annotateToFile } from '../../src/annotateCommand.ts';
import type { Comment } from '../../src/client/types.ts';
import { incrementRound, writeComments } from '../../src/reviewStore.ts';

const TMP_DIR = join(tmpdir(), `nymph-annotate-cmd-${process.pid}`);
const FILES_DIR = join(TMP_DIR, 'files');

// reviewStore は XDG_DATA_HOME を見るので、本物の ~/.local/share を汚さない
beforeEach(() => {
  mkdirSync(FILES_DIR, { recursive: true });
  process.env.XDG_DATA_HOME = TMP_DIR;
});

afterEach(() => {
  delete process.env.XDG_DATA_HOME;
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function makeMd(name: string, content: string): string {
  const p = join(FILES_DIR, name);
  writeFileSync(p, content);
  return p;
}

function sampleComment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c_abc123',
    lineStart: 1,
    lineEnd: 1,
    block_type: 'heading',
    context: '# 見出し',
    text: '指摘です',
    ...over,
  };
}

describe('annotateToFile', () => {
  it('コメント入りの Markdown を書き出して結果を返す', () => {
    const md = makeMd('a.md', '# 見出し\n\n本文\n');
    writeComments(md, [sampleComment()]);
    const out = join(TMP_DIR, 'out.md');

    const result = annotateToFile(md, out);

    expect(result.outPath).toBe(out);
    expect(result.file).toBe(md);
    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.counts).toEqual({ open: 1, deleted: 0, resolved: 0 });

    const written = readFileSync(out, 'utf-8');
    expect(written).toContain('# 見出し');
    expect(written).toContain('> [nymph] 未解決 · L1');
    expect(written).toContain('> 指摘です');
  });

  it('元ファイルは書き換えない', () => {
    const md = makeMd('b.md', '# 見出し\n');
    writeComments(md, [sampleComment()]);

    annotateToFile(md, join(TMP_DIR, 'out.md'));

    expect(readFileSync(md, 'utf-8')).toBe('# 見出し\n');
  });

  it('コメントが 0 件でも書き出せる', () => {
    const md = makeMd('c.md', '# 見出し\n');
    const out = join(TMP_DIR, 'out.md');

    const result = annotateToFile(md, out);

    expect(result.written).toBe(0);
    expect(readFileSync(out, 'utf-8')).toContain('# 見出し');
  });

  it('ラウンドも引き継ぐ', () => {
    const md = makeMd('d.md', '# 見出し\n');
    writeComments(md, [sampleComment()]);
    incrementRound(md);
    incrementRound(md);

    const out = join(TMP_DIR, 'out.md');
    annotateToFile(md, out);

    expect(readFileSync(out, 'utf-8')).toContain('ラウンド 2');
  });

  it('includeResolved: false なら解決済みを落とす', () => {
    const md = makeMd('e.md', '# 見出し\n');
    writeComments(md, [
      sampleComment({ id: 'c_1', text: '未解決の指摘' }),
      sampleComment({ id: 'c_2', resolved: true, text: '解決済みの指摘' }),
    ]);
    const out = join(TMP_DIR, 'out.md');

    const result = annotateToFile(md, out, { includeResolved: false });

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(1);
    const written = readFileSync(out, 'utf-8');
    expect(written).toContain('未解決の指摘');
    expect(written).not.toContain('解決済みの指摘');
  });

  it('出力先の親ディレクトリが無ければ作る', () => {
    const md = makeMd('f.md', '# 見出し\n');
    const out = join(TMP_DIR, 'nested', 'deep', 'out.md');

    annotateToFile(md, out);

    expect(existsSync(out)).toBe(true);
  });

  it('元ファイルへの上書きは拒否する', () => {
    const md = makeMd('g.md', '# 見出し\n');
    writeComments(md, [sampleComment()]);

    expect(() => annotateToFile(md, md)).toThrow(
      '書き戻し先が元ファイルと同じ',
    );
    expect(readFileSync(md, 'utf-8')).toBe('# 見出し\n');
  });

  it('存在しない元ファイルは例外にする', () => {
    expect(() =>
      annotateToFile(join(FILES_DIR, 'nope.md'), join(TMP_DIR, 'out.md')),
    ).toThrow();
  });

  it('相対パスでも絶対パスに解決して扱う', () => {
    const md = makeMd('h.md', '# 見出し\n');
    writeComments(md, [sampleComment()]);
    const out = join(TMP_DIR, 'out.md');

    // reviewStore のキーは絶対パス由来なので、相対指定でも同じコメントが載る
    const prevCwd = process.cwd();
    process.chdir(FILES_DIR);
    try {
      const result = annotateToFile('h.md', out);
      expect(result.file).toBe(md);
      expect(result.written).toBe(1);
    } finally {
      process.chdir(prevCwd);
    }
  });
});
