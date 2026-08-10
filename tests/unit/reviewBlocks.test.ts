import { describe, expect, it } from 'vitest';
import type { Comment } from '../../src/client/types.ts';
import {
  anchorComments,
  buildReviewBlocks,
  createBlockRenderer,
  findOrphanedIds,
  type ReviewBlock,
} from '../../src/reviewBlocks.ts';

function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c_aaa111',
    lineStart: 1,
    lineEnd: 1,
    block_type: 'heading',
    context: '# 見出し',
    text: 'ここを直してください',
    ...over,
  };
}

function blocksOf(src: string): ReviewBlock[] {
  return buildReviewBlocks(src, createBlockRenderer('/tmp', false));
}

describe('buildReviewBlocks', () => {
  it('ブロックごとに元ファイルの行範囲を持たせる', () => {
    const blocks = blocksOf('# 見出し\n\n本文です。\n\n- 項目\n- 項目\n');
    expect(blocks.map((b) => [b.type, b.lineStart, b.lineEnd])).toEqual([
      ['heading', 1, 1],
      ['paragraph', 3, 3],
      ['list', 5, 6],
    ]);
  });

  it('mermaid はソースを持つ専用ブロックにする', () => {
    const blocks = blocksOf('```mermaid\ngraph TD\n  A --> B\n```\n');
    expect(blocks[0].type).toBe('mermaid');
    expect(blocks[0].mermaidCode).toContain('graph TD');
    expect(blocks[0].html).toBe('');
  });

  it('コードブロックは言語クラス付きでエスケープする', () => {
    const blocks = blocksOf('```ts\nconst a = "<b>";\n```\n');
    expect(blocks[0].html).toContain('<code class="language-ts">');
    expect(blocks[0].html).toContain('&lt;b&gt;');
  });
});

describe('anchorComments', () => {
  const blocks = blocksOf('# 見出し\n\n本文です。\n');

  it('重なった最初のブロックへ 1 度だけ割り当てる', () => {
    const c = comment({ lineStart: 1, lineEnd: 3 });
    const { attached, unanchored } = anchorComments(blocks, [c]);
    expect(attached.get(blocks[0])).toEqual([c]);
    expect(attached.get(blocks[1])).toEqual([]);
    expect(unanchored).toEqual([]);
  });

  it('どのブロックにも重ならないものは unanchored へ回す', () => {
    const c = comment({ id: 'c_gone', lineStart: 99, lineEnd: 99 });
    const { unanchored } = anchorComments(blocks, [c]);
    expect(unanchored).toEqual([c]);
  });

  it('差分への指摘は本文ブロックに付けず unanchored へ回す', () => {
    const c = comment({ id: 'c_diff', block_type: 'diff', lineStart: 1 });
    const { attached, unanchored } = anchorComments(blocks, [c]);
    expect(attached.get(blocks[0])).toEqual([]);
    expect(unanchored).toEqual([c]);
  });

  it('同じブロックの複数コメントは渡された順に並べる', () => {
    const a = comment({ id: 'c_1', lineStart: 3, lineEnd: 3 });
    const b = comment({ id: 'c_2', lineStart: 3, lineEnd: 3 });
    const { attached } = anchorComments(blocks, [a, b]);
    expect(attached.get(blocks[1])).toEqual([a, b]);
  });
});

describe('findOrphanedIds', () => {
  const blocks = [
    { html: '<h1>見出し</h1>', lineStart: 1, lineEnd: 1, type: 'heading' },
    { html: '<p>本文です。</p>', lineStart: 3, lineEnd: 3, type: 'paragraph' },
  ];

  it('開始行が一致するブロックがあれば生きている', () => {
    expect(
      findOrphanedIds(blocks, [comment({ lineStart: 3, lineEnd: 3 })]).size,
    ).toBe(0);
  });

  it('開始行が一致するブロックが無ければ消えた扱い', () => {
    const orphaned = findOrphanedIds(blocks, [
      comment({ id: 'c_x', lineStart: 2, lineEnd: 2 }),
    ]);
    expect(orphaned.has('c_x')).toBe(true);
  });

  it('選択コメントはブロックの表示テキストで照合する', () => {
    const alive = findOrphanedIds(blocks, [
      comment({
        id: 'c_sel',
        block_type: 'selection',
        lineStart: 3,
        lineEnd: 3,
        context: '本文',
      }),
    ]);
    expect(alive.size).toBe(0);

    const gone = findOrphanedIds(blocks, [
      comment({
        id: 'c_sel',
        block_type: 'selection',
        lineStart: 3,
        lineEnd: 3,
        context: '無い文言',
      }),
    ]);
    expect(gone.has('c_sel')).toBe(true);
  });

  it('末尾の … を落として照合する', () => {
    const orphaned = findOrphanedIds(blocks, [
      comment({
        id: 'c_sel',
        block_type: 'selection',
        lineStart: 3,
        lineEnd: 3,
        context: '本文で…',
      }),
    ]);
    expect(orphaned.size).toBe(0);
  });

  it('差分への指摘は判定しない', () => {
    const orphaned = findOrphanedIds(blocks, [
      comment({ id: 'c_diff', block_type: 'diff', lineStart: 99, lineEnd: 99 }),
    ]);
    expect(orphaned.size).toBe(0);
  });
});
