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
import type { Comment } from '../../src/client/types.ts';
import { exportToFile } from '../../src/exportCommand.ts';
import { incrementRound, writeComments } from '../../src/reviewStore.ts';

const TMP_DIR = join(tmpdir(), `nymph-export-cmd-${process.pid}`);
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

describe('exportToFile', () => {
  it('HTML を書き出して結果を返す', () => {
    const md = makeMd('a.md', '# 見出し\n\n本文\n');
    const out = join(TMP_DIR, 'out.html');

    const result = exportToFile(md, out);

    expect(result.outPath).toBe(out);
    expect(result.file).toBe(md);
    expect(result.commentCount).toBe(0);
    expect(readFileSync(out, 'utf-8')).toContain('<h1>見出し</h1>');
  });

  it('保存済みコメントを焼き込む', () => {
    const md = makeMd('b.md', '# 見出し\n');
    writeComments(md, [sampleComment()]);
    const out = join(TMP_DIR, 'out.html');

    const result = exportToFile(md, out);

    expect(result.commentCount).toBe(1);
    expect(readFileSync(out, 'utf-8')).toContain('指摘です');
  });

  it('ラウンドも引き継ぐ', () => {
    const md = makeMd('c.md', '# 見出し\n');
    writeComments(md, [sampleComment()]);
    incrementRound(md);
    incrementRound(md);

    const out = join(TMP_DIR, 'out.html');
    exportToFile(md, out);

    expect(readFileSync(out, 'utf-8')).toContain('ラウンド 2');
  });

  it('出力先の親ディレクトリが無ければ作る', () => {
    const md = makeMd('d.md', '# 見出し\n');
    const out = join(TMP_DIR, 'nested', 'deep', 'out.html');

    exportToFile(md, out);

    expect(existsSync(out)).toBe(true);
  });

  it('元ファイルへの上書きは拒否する', () => {
    const md = makeMd('e.md', '# 見出し\n');
    expect(() => exportToFile(md, md)).toThrow(
      'エクスポート先が元ファイルと同じです',
    );
    expect(readFileSync(md, 'utf-8')).toBe('# 見出し\n');
  });

  it('存在しない元ファイルは例外にする', () => {
    expect(() =>
      exportToFile(join(FILES_DIR, 'nope.md'), join(TMP_DIR, 'out.html')),
    ).toThrow();
  });

  it('相対パスでも絶対パスに解決して扱う', () => {
    const md = makeMd('f.md', '# 見出し\n');
    writeComments(md, [sampleComment()]);
    const out = join(TMP_DIR, 'out.html');

    // reviewStore のキーは絶対パス由来なので、相対指定でも同じコメントが載る
    const prevCwd = process.cwd();
    process.chdir(FILES_DIR);
    try {
      const result = exportToFile('f.md', out);
      expect(result.file).toBe(md);
      expect(result.commentCount).toBe(1);
    } finally {
      process.chdir(prevCwd);
    }
  });
});
