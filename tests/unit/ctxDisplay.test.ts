import { describe, expect, test } from 'vitest';
import { ctxDisplay } from '../../src/client/lib/comments.ts';
import type { Comment } from '../../src/client/types.ts';

function makeComment(overrides: Partial<Comment>): Comment {
  return {
    id: 1,
    lineStart: 1,
    lineEnd: 1,
    block_type: 'paragraph',
    context: '',
    text: 'test',
    ...overrides,
  };
}

describe('ctxDisplay', () => {
  test('string context: 最初の行を返す', () => {
    const c = makeComment({ context: 'first line\nsecond line' });
    expect(ctxDisplay(c)).toBe('first line');
  });

  test('table context: ヘッダーを | で結合', () => {
    const c = makeComment({
      context: { headers: ['Name', 'Age', 'City'], rows: [] },
    });
    expect(ctxDisplay(c)).toBe('Name | Age | City');
  });

  test('code context: コードの最初の行を返す', () => {
    const c = makeComment({
      context: { lang: 'ts', code: 'const x = 1;\nconst y = 2;' },
    });
    expect(ctxDisplay(c)).toBe('const x = 1;');
  });

  test('空の context', () => {
    const c = makeComment({ context: '' });
    expect(ctxDisplay(c)).toBe('');
  });

  test('単一行 string', () => {
    const c = makeComment({ context: 'single line' });
    expect(ctxDisplay(c)).toBe('single line');
  });

  test('diff context: 対象行のテキストを返す', () => {
    const c = makeComment({
      block_type: 'diff',
      context: {
        side: 'new',
        oldLine: null,
        newLine: 5,
        line: '追加された行のテキスト',
        hunk: ['前の行', '追加された行のテキスト', '次の行'],
      },
    });
    expect(ctxDisplay(c)).toBe('追加された行のテキスト');
  });
});

describe('isDiffContext', () => {
  test('DiffContext を判別できる', async () => {
    const { isDiffContext } = await import('../../src/client/lib/comments.ts');
    expect(
      isDiffContext({
        side: 'old',
        oldLine: 1,
        newLine: null,
        line: 'x',
        hunk: ['x'],
      }),
    ).toBe(true);
    expect(isDiffContext('text')).toBe(false);
    expect(isDiffContext({ headers: [], rows: [] })).toBe(false);
    expect(isDiffContext({ code: 'x' })).toBe(false);
  });
});
