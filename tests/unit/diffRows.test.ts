import { describe, expect, test } from 'vitest';
import { buildSplitRows } from '../../src/client/lib/diffRows.ts';
import type { DiffLine } from '../../src/client/types.ts';

function eq(o: number, n: number, content: string): DiffLine {
  return { n, o, type: 'equal', content, g: null };
}
function del(o: number, content: string, g: number): DiffLine {
  return { n: null, o, type: 'delete', content, g };
}
function ins(n: number, content: string, g: number): DiffLine {
  return { n, o: null, type: 'insert', content, g };
}

describe('buildSplitRows', () => {
  test('equal 行は左右両方に同じ行が入る', () => {
    const rows = buildSplitRows([eq(1, 1, 'a'), eq(2, 2, 'b')]);
    expect(rows).toHaveLength(2);
    expect(rows[0].left?.content).toBe('a');
    expect(rows[0].right?.content).toBe('a');
    expect(rows[0].pair).toBe(false);
  });

  test('1:1 の replace は同じ行にペアリングされ pair=true', () => {
    const rows = buildSplitRows([
      eq(1, 1, 'a'),
      del(2, 'old', 0),
      ins(2, 'new', 0),
      eq(3, 3, 'c'),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[1].left?.content).toBe('old');
    expect(rows[1].right?.content).toBe('new');
    expect(rows[1].pair).toBe(true);
  });

  test('削除のみのグループは右側が null', () => {
    const rows = buildSplitRows([
      eq(1, 1, 'a'),
      del(2, 'gone', 0),
      eq(3, 2, 'c'),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[1].left?.content).toBe('gone');
    expect(rows[1].right).toBeNull();
    expect(rows[1].pair).toBe(false);
  });

  test('追加のみのグループは左側が null', () => {
    const rows = buildSplitRows([
      eq(1, 1, 'a'),
      ins(2, 'added', 0),
      eq(2, 3, 'c'),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[1].left).toBeNull();
    expect(rows[1].right?.content).toBe('added');
    expect(rows[1].pair).toBe(false);
  });

  test('1:N の replace は行単位でペアリングし、余りは左が null', () => {
    const rows = buildSplitRows([
      del(2, 'old', 0),
      ins(2, 'new1', 0),
      ins(3, 'new2', 0),
      ins(4, 'new3', 0),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].left?.content).toBe('old');
    expect(rows[0].right?.content).toBe('new1');
    expect(rows[1].left).toBeNull();
    expect(rows[1].right?.content).toBe('new2');
    expect(rows[2].left).toBeNull();
    expect(rows[2].right?.content).toBe('new3');
    // 行数が一致しないグループは対応が曖昧なので文字単位ハイライトしない
    expect(rows.every((r) => r.pair === false)).toBe(true);
  });

  test('N:1 の replace は余りの右が null', () => {
    const rows = buildSplitRows([
      del(2, 'old1', 0),
      del(3, 'old2', 0),
      ins(2, 'new', 0),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].left?.content).toBe('old1');
    expect(rows[0].right?.content).toBe('new');
    expect(rows[1].left?.content).toBe('old2');
    expect(rows[1].right).toBeNull();
  });

  test('複数グループが順番に並ぶ', () => {
    const rows = buildSplitRows([
      del(1, 'x', 0),
      ins(1, 'X', 0),
      eq(2, 2, 'mid'),
      ins(3, 'y', 1),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].pair).toBe(true);
    expect(rows[1].left?.content).toBe('mid');
    expect(rows[2].left).toBeNull();
    expect(rows[2].right?.content).toBe('y');
  });

  test('空入力は空配列', () => {
    expect(buildSplitRows([])).toEqual([]);
  });
});
