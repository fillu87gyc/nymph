import { describe, expect, it } from 'vitest';
import { summarizeDiff } from '../../src/client/lib/diffSummary.ts';
import type { DiffLine } from '../../src/client/types.ts';

function equal(n: number, content = 'same'): DiffLine {
  return { n, o: n, type: 'equal', content, g: null };
}

describe('summarizeDiff', () => {
  it('変更が無ければ空のサマリ', () => {
    expect(summarizeDiff([equal(1), equal(2)])).toEqual({
      added: 0,
      deleted: 0,
      hunks: [],
    });
  });

  it('追加・削除の合計を数える', () => {
    const lines: DiffLine[] = [
      equal(1),
      { n: null, o: 2, type: 'delete', content: 'old', g: 0 },
      { n: 2, o: null, type: 'insert', content: 'new', g: 0 },
      { n: 3, o: null, type: 'insert', content: 'new2', g: 1 },
    ];
    const s = summarizeDiff(lines);
    expect(s.added).toBe(2);
    expect(s.deleted).toBe(1);
    expect(s.hunks).toHaveLength(2);
  });

  it('書き換えのかたまりは新側の行を代表にする', () => {
    const lines: DiffLine[] = [
      { n: null, o: 5, type: 'delete', content: '古い行', g: 0 },
      { n: 5, o: null, type: 'insert', content: '新しい行', g: 0 },
    ];
    expect(summarizeDiff(lines).hunks[0]).toEqual({
      g: 0,
      added: 1,
      deleted: 1,
      line: 5,
      side: 'new',
      preview: '新しい行',
    });
  });

  it('削除だけのかたまりは旧側の行を代表にする', () => {
    const lines: DiffLine[] = [
      { n: null, o: 9, type: 'delete', content: '  消えた行  ', g: 3 },
      { n: null, o: 10, type: 'delete', content: 'もう1行', g: 3 },
    ];
    expect(summarizeDiff(lines).hunks[0]).toEqual({
      g: 3,
      added: 0,
      deleted: 2,
      line: 9,
      side: 'old',
      preview: '消えた行',
    });
  });

  it('かたまりはグループ番号の順に並ぶ', () => {
    const lines: DiffLine[] = [
      { n: 7, o: null, type: 'insert', content: 'b', g: 2 },
      { n: 3, o: null, type: 'insert', content: 'a', g: 1 },
    ];
    expect(summarizeDiff(lines).hunks.map((h) => h.g)).toEqual([1, 2]);
  });

  it('行番号が欠けた壊れた行はかたまりにしない', () => {
    const lines: DiffLine[] = [
      { n: null, o: null, type: 'insert', content: 'broken', g: 0 },
    ];
    expect(summarizeDiff(lines).hunks).toEqual([]);
    // 件数だけは数える（表示上の合計が実データとずれないように）
    expect(summarizeDiff(lines).added).toBe(1);
  });
});
