import { marked } from 'marked';
import { describe, expect, test } from 'vitest';
import {
  assignLines,
  getBlockTokensDFS,
} from '../../src/client/lib/markdown.ts';

describe('assignLines', () => {
  test('段落に正しい行番号が付く', () => {
    const src = 'hello world\n\nfoo bar';
    const tokens = marked.lexer(src);
    assignLines(src, tokens);
    const blocks = getBlockTokensDFS(tokens);
    const paras = blocks.filter((t) => t.type === 'paragraph');
    expect(paras[0].lineStart).toBe(1);
    expect(paras[0].lineEnd).toBe(1);
    expect(paras[1].lineStart).toBe(3);
    expect(paras[1].lineEnd).toBe(3);
  });

  test('見出しに正しい行番号が付く', () => {
    const src = '# Title\n\nParagraph';
    const tokens = marked.lexer(src);
    assignLines(src, tokens);
    const blocks = getBlockTokensDFS(tokens);
    const heading = blocks.find((t) => t.type === 'heading');
    expect(heading?.lineStart).toBe(1);
    expect(heading?.lineEnd).toBe(1);
  });

  test('複数行コードブロックの行番号', () => {
    const src = 'intro\n\n```\nline1\nline2\nline3\n```\n\noutro';
    const tokens = marked.lexer(src);
    assignLines(src, tokens);
    const blocks = getBlockTokensDFS(tokens);
    const code = blocks.find((t) => t.type === 'code');
    expect(code?.lineStart).toBe(3);
    expect(code?.lineEnd).toBe(7);
  });

  test('空ソースで何もしない', () => {
    const src = '';
    const tokens = marked.lexer(src);
    assignLines(src, tokens);
    expect(getBlockTokensDFS(tokens)).toHaveLength(0);
  });

  test('テーブルの行番号', () => {
    const src = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const tokens = marked.lexer(src);
    assignLines(src, tokens);
    const blocks = getBlockTokensDFS(tokens);
    const table = blocks.find((t) => t.type === 'table');
    expect(table?.lineStart).toBe(1);
    expect(table?.lineEnd).toBe(3);
  });
});
