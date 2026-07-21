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
});
