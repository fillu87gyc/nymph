import { describe, test, expect } from 'vitest';
import { diffArrays } from 'diff';

function computeDiff(checkpoint: string, current: string) {
  const aLines = checkpoint.split('\n');
  const bLines = current.split('\n');
  const changes = diffArrays(aLines, bLines);
  const result: Array<{ n: number | null; type: string; content: string; g: number | null }> = [];
  let currentN = 0;
  let groupId = 0;
  let i = 0;
  while (i < changes.length) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      for (const line of change.value) {
        currentN++;
        result.push({ n: currentN, type: 'equal', content: line, g: null });
      }
      i++;
    } else if (change.removed) {
      const next = changes[i + 1];
      if (next?.added) {
        for (const line of change.value) result.push({ n: null, type: 'delete', content: line, g: groupId });
        for (const line of next.value) { currentN++; result.push({ n: currentN, type: 'insert', content: line, g: groupId }); }
        groupId++;
        i += 2;
      } else {
        for (const line of change.value) result.push({ n: null, type: 'delete', content: line, g: groupId });
        groupId++;
        i++;
      }
    } else {
      for (const line of change.value) { currentN++; result.push({ n: currentN, type: 'insert', content: line, g: groupId }); }
      groupId++;
      i++;
    }
  }
  return result;
}

describe('computeDiff', () => {
  test('同一コンテンツは全 equal', () => {
    const src = 'a\nb\nc';
    const result = computeDiff(src, src);
    expect(result.every(l => l.type === 'equal')).toBe(true);
    expect(result).toHaveLength(3);
  });

  test('1行置換 (replace)', () => {
    const result = computeDiff('a\nold\nc', 'a\nnew\nc');
    const del = result.filter(l => l.type === 'delete');
    const ins = result.filter(l => l.type === 'insert');
    expect(del).toHaveLength(1);
    expect(del[0].content).toBe('old');
    expect(ins).toHaveLength(1);
    expect(ins[0].content).toBe('new');
    expect(del[0].g).toBe(ins[0].g);
  });

  test('末尾への追記 (insert)', () => {
    const result = computeDiff('a\nb', 'a\nb\nc');
    const ins = result.filter(l => l.type === 'insert');
    expect(ins).toHaveLength(1);
    expect(ins[0].content).toBe('c');
    expect(ins[0].n).toBe(3);
  });

  test('行の削除 (delete)', () => {
    const result = computeDiff('a\nb\nc', 'a\nc');
    const del = result.filter(l => l.type === 'delete');
    expect(del).toHaveLength(1);
    expect(del[0].content).toBe('b');
    expect(del[0].n).toBeNull();
  });

  test('グループ ID が replace で共有される', () => {
    const result = computeDiff('x\nold\ny', 'x\nnew\ny');
    const del = result.find(l => l.type === 'delete')!;
    const ins = result.find(l => l.type === 'insert')!;
    expect(del.g).toBe(ins.g);
    expect(del.g).not.toBeNull();
  });

  test('equal 行の n は 1 始まりで連番', () => {
    const result = computeDiff('a\nb\nc', 'a\nb\nc');
    expect(result.map(l => l.n)).toEqual([1, 2, 3]);
  });
});
