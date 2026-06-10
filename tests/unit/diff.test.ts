import { describe, expect, test } from 'vitest';
import { computeDiff } from '../../src/server.ts';

describe('computeDiff', () => {
  test('同一コンテンツは全 equal', () => {
    const src = 'a\nb\nc';
    const result = computeDiff(src, src);
    expect(result.every((l) => l.type === 'equal')).toBe(true);
    expect(result).toHaveLength(3);
  });

  test('1行置換 (replace)', () => {
    const result = computeDiff('a\nold\nc', 'a\nnew\nc');
    const del = result.filter((l) => l.type === 'delete');
    const ins = result.filter((l) => l.type === 'insert');
    expect(del).toHaveLength(1);
    expect(del[0].content).toBe('old');
    expect(ins).toHaveLength(1);
    expect(ins[0].content).toBe('new');
    expect(del[0].g).toBe(ins[0].g);
  });

  test('末尾への追記 (insert)', () => {
    const result = computeDiff('a\nb', 'a\nb\nc');
    const ins = result.filter((l) => l.type === 'insert');
    expect(ins).toHaveLength(1);
    expect(ins[0].content).toBe('c');
    expect(ins[0].n).toBe(3);
  });

  test('行の削除 (delete)', () => {
    const result = computeDiff('a\nb\nc', 'a\nc');
    const del = result.filter((l) => l.type === 'delete');
    expect(del).toHaveLength(1);
    expect(del[0].content).toBe('b');
    expect(del[0].n).toBeNull();
  });

  test('グループ ID が replace で共有される', () => {
    const result = computeDiff('x\nold\ny', 'x\nnew\ny');
    const del = result.find((l) => l.type === 'delete');
    const ins = result.find((l) => l.type === 'insert');
    if (!del || !ins) throw new Error('delete/insert 行が見つかりません');
    expect(del.g).toBe(ins.g);
    expect(del.g).not.toBeNull();
  });

  test('equal 行の n は 1 始まりで連番', () => {
    const result = computeDiff('a\nb\nc', 'a\nb\nc');
    expect(result.map((l) => l.n)).toEqual([1, 2, 3]);
  });
});

// 旧行番号 o: split ビューの左ペイン（checkpoint 側）の行番号。
// equal / delete はチェックポイント側に存在するので連番、insert は存在しないので null。
describe('computeDiff の旧行番号 (o)', () => {
  test('equal 行は o と n が同時に進む', () => {
    const result = computeDiff('a\nb\nc', 'a\nb\nc');
    expect(result.map((l) => l.o)).toEqual([1, 2, 3]);
  });

  test('replace: delete は o を持ち n は null、insert は n を持ち o は null', () => {
    const result = computeDiff('a\nold\nc', 'a\nnew\nc');
    const del = result.find((l) => l.type === 'delete');
    const ins = result.find((l) => l.type === 'insert');
    if (!del || !ins) throw new Error('delete/insert 行が見つかりません');
    expect(del.o).toBe(2);
    expect(del.n).toBeNull();
    expect(ins.o).toBeNull();
    expect(ins.n).toBe(2);
  });

  test('行削除後の equal 行は o と n がずれる', () => {
    const result = computeDiff('a\nb\nc', 'a\nc');
    const last = result[result.length - 1];
    expect(last.type).toBe('equal');
    expect(last.content).toBe('c');
    expect(last.o).toBe(3);
    expect(last.n).toBe(2);
  });

  test('行追加後の equal 行は n が先行する', () => {
    const result = computeDiff('a\nc', 'a\nb\nc');
    const last = result[result.length - 1];
    expect(last.type).toBe('equal');
    expect(last.content).toBe('c');
    expect(last.o).toBe(2);
    expect(last.n).toBe(3);
  });

  test('複数行 replace でも o は checkpoint 側の連番になる', () => {
    const result = computeDiff('x\np\nq\ny', 'x\nP\nQ\nR\ny');
    const dels = result.filter((l) => l.type === 'delete');
    const inss = result.filter((l) => l.type === 'insert');
    expect(dels.map((l) => l.o)).toEqual([2, 3]);
    expect(inss.map((l) => l.o)).toEqual([null, null, null]);
    expect(inss.map((l) => l.n)).toEqual([2, 3, 4]);
  });
});
