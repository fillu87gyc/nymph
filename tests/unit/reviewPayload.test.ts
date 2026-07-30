import { describe, expect, test } from 'vitest';
import { buildReviewPayload } from '../../src/client/lib/comments.ts';
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

describe('buildReviewPayload', () => {
  test('解決済みのコメントは含めない', () => {
    const payload = buildReviewPayload(
      [
        makeComment({ id: 1, text: '未解決' }),
        makeComment({ id: 2, text: '解決済み', resolved: true }),
      ],
      '/tmp/doc.md',
    );

    expect(payload.comment_count).toBe(1);
    expect(payload.comments).toHaveLength(1);
    expect(payload.comments[0].comment).toBe('未解決');
  });

  test('resolved 未定義・false は未解決として含める', () => {
    const payload = buildReviewPayload(
      [
        makeComment({ id: 1, text: 'undefined' }),
        makeComment({ id: 2, text: 'false', resolved: false }),
      ],
      '/tmp/doc.md',
    );

    expect(payload.comments.map((c) => c.comment)).toEqual([
      'undefined',
      'false',
    ]);
  });

  test('id は未解決コメントだけで 1 から振り直される', () => {
    const payload = buildReviewPayload(
      [
        makeComment({ id: 10, text: '解決済み', resolved: true }),
        makeComment({ id: 11, text: 'A' }),
        makeComment({ id: 12, text: 'B' }),
      ],
      '/tmp/doc.md',
    );

    expect(payload.comments.map((c) => c.id)).toEqual([1, 2]);
  });

  test('すべて解決済みなら空の payload になる', () => {
    const payload = buildReviewPayload(
      [makeComment({ id: 1, resolved: true })],
      '/tmp/doc.md',
    );

    expect(payload.comment_count).toBe(0);
    expect(payload.comments).toEqual([]);
  });

  test('file はベース名、activeFile が無ければ —', () => {
    expect(buildReviewPayload([makeComment()], '/a/b/doc.md').file).toBe(
      'doc.md',
    );
    expect(buildReviewPayload([makeComment()], null).file).toBe('—');
  });

  test('コメントの主要フィールドを保持する', () => {
    const payload = buildReviewPayload(
      [
        makeComment({
          lineStart: 3,
          lineEnd: 5,
          block_type: 'code',
          context: 'const a = 1;',
          text: 'ここ',
        }),
      ],
      '/tmp/doc.md',
    );

    expect(payload.comments[0]).toEqual({
      id: 1,
      line_start: 3,
      line_end: 5,
      block_type: 'code',
      context: 'const a = 1;',
      comment: 'ここ',
    });
  });

  test('block_type が無ければ unknown', () => {
    const payload = buildReviewPayload(
      [makeComment({ block_type: undefined })],
      '/tmp/doc.md',
    );

    expect(payload.comments[0].block_type).toBe('unknown');
  });
});
