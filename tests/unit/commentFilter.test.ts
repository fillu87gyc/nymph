import { describe, expect, test } from 'vitest';
import { matchesCommentFilter } from '../../src/client/lib/comments.ts';
import type { Comment } from '../../src/client/types.ts';

function makeComment(overrides: Partial<Comment> = {}): Comment {
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

describe('matchesCommentFilter', () => {
  test('all: resolved の有無に関わらず常に true', () => {
    expect(matchesCommentFilter(makeComment(), 'all')).toBe(true);
    expect(matchesCommentFilter(makeComment({ resolved: true }), 'all')).toBe(
      true,
    );
    expect(matchesCommentFilter(makeComment({ resolved: false }), 'all')).toBe(
      true,
    );
  });

  test('open: resolved 未定義は open 扱い', () => {
    expect(matchesCommentFilter(makeComment(), 'open')).toBe(true);
  });

  test('open: resolved:false も open 扱い', () => {
    expect(matchesCommentFilter(makeComment({ resolved: false }), 'open')).toBe(
      true,
    );
  });

  test('open: resolved:true は除外される', () => {
    expect(matchesCommentFilter(makeComment({ resolved: true }), 'open')).toBe(
      false,
    );
  });

  test('resolved: resolved:true のみ true', () => {
    expect(
      matchesCommentFilter(makeComment({ resolved: true }), 'resolved'),
    ).toBe(true);
  });

  test('resolved: 未定義・false は false', () => {
    expect(matchesCommentFilter(makeComment(), 'resolved')).toBe(false);
    expect(
      matchesCommentFilter(makeComment({ resolved: false }), 'resolved'),
    ).toBe(false);
  });

  test('open: 元の文章が削除されたコメントは除外される（deleted になるため）', () => {
    expect(matchesCommentFilter(makeComment(), 'open', true)).toBe(false);
  });

  test('deleted: 未解決かつ元の文章が削除されたものだけ true', () => {
    expect(matchesCommentFilter(makeComment(), 'deleted', true)).toBe(true);
    expect(matchesCommentFilter(makeComment(), 'deleted', false)).toBe(false);
  });

  test('deleted: 解決済みは元の文章が削除されていても false（resolved のまま）', () => {
    expect(
      matchesCommentFilter(makeComment({ resolved: true }), 'deleted', true),
    ).toBe(false);
  });

  test('resolved: 元の文章が削除されていても true', () => {
    expect(
      matchesCommentFilter(makeComment({ resolved: true }), 'resolved', true),
    ).toBe(true);
  });

  test('all: 元の文章が削除されていても true', () => {
    expect(matchesCommentFilter(makeComment(), 'all', true)).toBe(true);
  });
});
