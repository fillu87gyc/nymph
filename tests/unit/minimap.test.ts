import { describe, expect, it } from 'vitest';
import {
  buildMinimapRows,
  countLines,
  lineAtRatio,
  MAX_MINIMAP_ROWS,
  ratioAtLine,
} from '../../src/client/lib/minimap.ts';

describe('buildMinimapRows', () => {
  it('行ごとに 1 本の棒を作り、種別を判定する', () => {
    const src = [
      '# 見出し',
      '',
      'ふつうの段落',
      '- 箇条書き',
      '> 引用',
      '| a | b |',
    ].join('\n');
    expect(buildMinimapRows(src).map((r) => r.kind)).toEqual([
      'heading',
      'blank',
      'text',
      'list',
      'quote',
      'table',
    ]);
  });

  it('コードフェンスの中と囲み自身を code にする', () => {
    const rows = buildMinimapRows('```ts\nconst x = 1;\n```');
    expect(rows.map((r) => r.kind)).toEqual(['code', 'code', 'code']);
  });

  it('棒の長さは行の長さに比例し、1 で頭打ちになる', () => {
    const rows = buildMinimapRows(['', 'abcd', 'x'.repeat(200)].join('\n'));
    expect(rows[0].weight).toBe(0);
    expect(rows[1].weight).toBeCloseTo(4 / 80);
    expect(rows[2].weight).toBe(1);
  });

  it('行番号は 1 始まりで、棒が代表する範囲を持つ', () => {
    const rows = buildMinimapRows('a\nb\nc');
    expect(rows.map((r) => [r.line, r.lineEnd])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('行数が多い文書では束ねて本数の上限を守る', () => {
    const src = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n');
    const rows = buildMinimapRows(src);
    expect(rows.length).toBeLessThanOrEqual(MAX_MINIMAP_ROWS);
    expect(rows[0].line).toBe(1);
    expect(rows[rows.length - 1].lineEnd).toBe(2000);
  });

  it('束ねた棒の種別は優先度の高いほう（見出し）を採る', () => {
    const src = ['ふつうの行', '# 見出し', 'ふつうの行', 'ふつうの行'].join(
      '\n',
    );
    expect(buildMinimapRows(src, 2)[0].kind).toBe('heading');
  });

  it('空文字では棒を作らない', () => {
    expect(buildMinimapRows('')).toEqual([]);
  });

  it('末尾の空行は棒にしない', () => {
    expect(buildMinimapRows('a\n\n\n')).toHaveLength(1);
  });
});

describe('countLines', () => {
  it('行数を数える（空文字は 0）', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb')).toBe(2);
  });
});

describe('lineAtRatio / ratioAtLine', () => {
  it('縦位置から行番号へ換算する', () => {
    expect(lineAtRatio(0, 100)).toBe(1);
    expect(lineAtRatio(0.5, 100)).toBe(50);
    expect(lineAtRatio(1, 100)).toBe(100);
  });

  it('範囲外の値は端に丸める', () => {
    expect(lineAtRatio(-1, 100)).toBe(1);
    expect(lineAtRatio(9, 100)).toBe(100);
  });

  it('行が無い文書では 1 行目を指す', () => {
    expect(lineAtRatio(0.5, 0)).toBe(1);
  });

  it('行番号から縦位置へ換算する（先頭は 0）', () => {
    expect(ratioAtLine(1, 100)).toBe(0);
    expect(ratioAtLine(51, 100)).toBeCloseTo(0.5);
    expect(ratioAtLine(999, 100)).toBe(1);
    expect(ratioAtLine(1, 0)).toBe(0);
  });
});
