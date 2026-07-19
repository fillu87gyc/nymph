import { describe, expect, test } from 'vitest';
import { extractToc } from '../../src/client/lib/toc.ts';

describe('extractToc', () => {
  test('見出しがない場合は空配列', () => {
    expect(extractToc('本文だけ\n\nもう一段落\n')).toEqual([]);
  });

  test('見出しをレベル・テキスト・行番号付きで抽出する', () => {
    const src = '# Title\n\nintro\n\n## Section A\n\nbody\n\n## Section B\n';
    const items = extractToc(src);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ level: 1, text: 'Title', lineStart: 1 });
    expect(items[1]).toMatchObject({
      level: 2,
      text: 'Section A',
      lineStart: 5,
    });
    expect(items[2]).toMatchObject({
      level: 2,
      text: 'Section B',
      lineStart: 9,
    });
  });

  test('見出し内のインライン記法をプレーンテキストへ変換する', () => {
    const src = '## Hello **World** and `code`\n';
    const items = extractToc(src);
    expect(items[0].text).toBe('Hello World and code');
  });

  test('key がユニーク', () => {
    const src = '# A\n\n## B\n\n### C\n';
    const items = extractToc(src);
    const keys = new Set(items.map((i) => i.key));
    expect(keys.size).toBe(items.length);
  });

  test('コードブロック内の # はヘディングとして扱わない', () => {
    const src = '```\n# not a heading\n```\n\n## Real Heading\n';
    const items = extractToc(src);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('Real Heading');
  });

  test('blockquote 内の見出しは独立したブロックを持たないため対象外', () => {
    // blockquote はひとつのブロックとして描画され、内部の見出しは
    // 個別のジャンプ先 DOM を持たない（parseBlocks の __nested 判定と同じ扱い）
    const src = '> ## Quoted Heading\n> body\n\n## Real Heading\n';
    const items = extractToc(src);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('Real Heading');
  });
});
