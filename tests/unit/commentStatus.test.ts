import { describe, expect, test } from 'vitest';
import {
  COMMENT_STATUS_LABEL,
  commentStatus,
} from '../../src/client/lib/comments.ts';
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

describe('commentStatus', () => {
  test('未解決かつ対象が残っていれば open', () => {
    expect(commentStatus(makeComment(), false)).toBe('open');
    expect(commentStatus(makeComment({ resolved: false }), false)).toBe('open');
  });

  test('未解決で対象が削除されていれば deleted', () => {
    expect(commentStatus(makeComment(), true)).toBe('deleted');
    expect(commentStatus(makeComment({ resolved: false }), true)).toBe(
      'deleted',
    );
  });

  test('解決済みなら対象が削除されていても resolved', () => {
    expect(commentStatus(makeComment({ resolved: true }), true)).toBe(
      'resolved',
    );
    expect(commentStatus(makeComment({ resolved: true }), false)).toBe(
      'resolved',
    );
  });

  test('日本語ラベルは 未解決 / 削除済 / 解決済', () => {
    expect(COMMENT_STATUS_LABEL.open).toBe('未解決');
    expect(COMMENT_STATUS_LABEL.deleted).toBe('削除済');
    expect(COMMENT_STATUS_LABEL.resolved).toBe('解決済');
  });
});
