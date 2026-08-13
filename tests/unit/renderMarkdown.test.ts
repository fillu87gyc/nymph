import { describe, expect, test } from 'vitest';
import { parseBlocks } from '../../src/client/lib/parseBlocks.ts';

describe('parseBlocks', () => {
  test('空ソースは空配列を返す', () => {
    expect(parseBlocks('')).toHaveLength(0);
    expect(parseBlocks('   ')).toHaveLength(0);
  });

  test('段落が type=paragraph のブロックとして返る', () => {
    const blocks = parseBlocks('Hello world');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].html).toContain('<p>');
  });

  test('見出しが type=heading のブロックとして返る', () => {
    const blocks = parseBlocks('# Title');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[0].html).toContain('<h1>');
  });

  test('コードブロックが type=code で <pre><code> を含む', () => {
    const blocks = parseBlocks('```ts\nconst x = 1;\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('code');
    expect(blocks[0].html).toContain('<pre>');
    expect(blocks[0].html).toContain('<code');
  });

  test('複数ブロックが正しい数だけ返る', () => {
    const blocks = parseBlocks('# H1\n\nParagraph');
    expect(blocks).toHaveLength(2);
  });

  test('各ブロックに lineStart / lineEnd が設定される', () => {
    const blocks = parseBlocks('# H1\n\nParagraph');
    for (const b of blocks) {
      expect(b.lineStart).toBeTypeOf('number');
      expect(b.lineEnd).toBeTypeOf('number');
    }
  });

  test('リストが type=list で <ul> を含む', () => {
    const blocks = parseBlocks('- item1\n- item2');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('list');
    expect(blocks[0].html).toContain('<ul>');
  });

  test('テーブルが type=table で commentContext.context に headers を含む', () => {
    const blocks = parseBlocks('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('table');
    const ctx = blocks[0].commentContext.context;
    expect(ctx).toHaveProperty('headers');
  });

  test('水平線が type=hr として返る', () => {
    const blocks = parseBlocks('---');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('hr');
  });

  test('blockquote はブロックが 1 つだけ返り type=blockquote', () => {
    const blocks = parseBlocks('> quoted text');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('blockquote');
    expect(blocks[0].html).toContain('<blockquote>');
  });

  test('mermaid が type=mermaid で mermaidCode / mermaidId を持つ', () => {
    const blocks = parseBlocks('```mermaid\ngraph TD; A-->B\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('mermaid');
    expect(blocks[0].mermaidCode).toContain('graph TD');
    expect(blocks[0].mermaidId).toMatch(/^mermaid-/);
  });

  test('コードブロックの commentContext に lang と code が含まれる', () => {
    const blocks = parseBlocks('```ts\nconst x = 1;\n```');
    const ctx = blocks[0].commentContext.context;
    expect(ctx).toHaveProperty('lang', 'ts');
    expect(ctx).toHaveProperty('code');
  });

  test('blockquote 内の paragraph は独立ブロックにならない', () => {
    const blocks = parseBlocks('> paragraph inside quote');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('blockquote');
  });

  test('画像の相対パスは md ファイル起点の /image に向く', () => {
    const file = '/w/docs/guide.md';
    const blocks = parseBlocks('![図](./img/a.png)', file);
    expect(blocks[0].html).toContain(
      `src="/image?file=${encodeURIComponent(file)}&amp;path=${encodeURIComponent('./img/a.png')}"`,
    );
  });

  test('表の中の画像も /image に向く', () => {
    const file = '/w/docs/guide.md';
    const blocks = parseBlocks('| A |\n| --- |\n| ![図](./img/a.png) |', file);
    expect(blocks[0].type).toBe('table');
    expect(blocks[0].html).toContain('src="/image?file=');
  });

  test('外部 URL の画像と、ファイル未指定時の相対パスは書き換えない', () => {
    expect(
      parseBlocks('![図](https://example.com/a.png)', '/w/docs/guide.md')[0]
        .html,
    ).toContain('src="https://example.com/a.png"');
    expect(parseBlocks('![図](./img/a.png)')[0].html).toContain(
      'src="./img/a.png"',
    );
  });
});
