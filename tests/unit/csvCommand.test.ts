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
import { exportCommentsCsv } from '../../src/csvCommand.ts';
import { writeComments } from '../../src/reviewStore.ts';

const TMP_DIR = join(tmpdir(), `nymph-csv-cmd-${process.pid}`);
const FILES_DIR = join(TMP_DIR, 'files');

beforeEach(() => {
  mkdirSync(FILES_DIR, { recursive: true });
  process.env.XDG_DATA_HOME = TMP_DIR;
});

afterEach(() => {
  delete process.env.XDG_DATA_HOME;
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function makeMd(name: string, content = '# 見出し\n\n本文です。\n'): string {
  const p = join(FILES_DIR, name);
  writeFileSync(p, content);
  return p;
}

function sampleComment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c_abc123',
    lineStart: 3,
    lineEnd: 3,
    block_type: 'paragraph',
    context: '本文です。',
    text: '指摘です',
    ...over,
  };
}

describe('exportCommentsCsv', () => {
  it('出力先を省くと書き出さず CSV を返す', () => {
    const md = makeMd('a.md');
    writeComments(md, [sampleComment()]);

    const result = exportCommentsCsv(md);

    expect(result.outPath).toBeNull();
    expect(result.file).toBe(md);
    expect(result.count).toBe(1);
    expect(result.csv).toContain('file,id,status');
    expect(result.csv).toContain('a.md,c_abc123,open,3,3,paragraph');
  });

  it('出力先を指定するとファイルに書き出す', () => {
    const md = makeMd('b.md');
    writeComments(md, [sampleComment()]);
    const out = join(TMP_DIR, 'out.csv');

    const result = exportCommentsCsv(md, { outPath: out });

    expect(result.outPath).toBe(out);
    expect(readFileSync(out, 'utf-8')).toBe(result.csv);
  });

  it('コメントが 0 件なら見出し行だけを出す', () => {
    const md = makeMd('c.md');

    const result = exportCommentsCsv(md);

    expect(result.count).toBe(0);
    expect(result.csv.trim().split('\r\n')).toHaveLength(1);
  });

  it('出力先の親ディレクトリが無ければ作る', () => {
    const md = makeMd('d.md');
    const out = join(TMP_DIR, 'nested', 'deep', 'out.csv');

    exportCommentsCsv(md, { outPath: out });

    expect(existsSync(out)).toBe(true);
  });

  it('元ファイルは書き換えない', () => {
    const md = makeMd('e.md');
    writeComments(md, [sampleComment()]);

    exportCommentsCsv(md, { outPath: join(TMP_DIR, 'out.csv') });

    expect(readFileSync(md, 'utf-8')).toBe('# 見出し\n\n本文です。\n');
  });

  it('元ファイルへの上書きは拒否する', () => {
    const md = makeMd('f.md');
    expect(() => exportCommentsCsv(md, { outPath: md })).toThrow(
      '出力先が元ファイルと同じです',
    );
  });

  it('存在しない元ファイルは例外にする', () => {
    expect(() => exportCommentsCsv(join(FILES_DIR, 'nope.md'))).toThrow();
  });

  it('bom オプションを渡せる', () => {
    const md = makeMd('g.md');
    const result = exportCommentsCsv(md, { bom: true });
    expect(result.csv.charCodeAt(0)).toBe(0xfeff);
  });
});
