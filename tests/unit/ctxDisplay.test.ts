import { describe, test, expect } from 'vitest';
import { ctxDisplay } from '../../src/client/lib/comments.ts';
import type { Comment } from '../../src/client/types.ts';

function makeComment(overrides: Partial<Comment>): Comment {
  return {
    id: 1, ls: 1, le: 1, block_type: 'paragraph',
    context: '', text: 'test', ...overrides,
  };
}

describe('ctxDisplay', () => {
  test('string context: 最初の行を返す', () => {
    const c = makeComment({ context: 'first line\nsecond line' });
    expect(ctxDisplay(c)).toBe('first line');
  });

  test('table context: ヘッダーを | で結合', () => {
    const c = makeComment({ context: { headers: ['Name', 'Age', 'City'], rows: [] } });
    expect(ctxDisplay(c)).toBe('Name | Age | City');
  });

  test('code context: コードの最初の行を返す', () => {
    const c = makeComment({ context: { lang: 'ts', code: 'const x = 1;\nconst y = 2;' } });
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
});
