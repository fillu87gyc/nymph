import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useComments } from '../../src/client/hooks/useComments.ts';
import type { Comment, PendingComment } from '../../src/client/types.ts';

const mockComment: Comment = {
  id: 1,
  ls: 2,
  le: 4,
  block_type: 'paragraph',
  context: 'test context',
  text: 'test comment',
};

const pending: PendingComment = {
  ls: 2,
  le: 4,
  block_type: 'paragraph',
  context: 'test context',
  selection_offset: null,
};

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useComments', () => {
  test('初期状態: コメント空・nextId=1', () => {
    const { result } = renderHook(() => useComments());
    expect(result.current.comments).toEqual([]);
    expect(result.current.nextId).toBe(1);
  });

  test('loadComments でサーバーからコメントを取得する', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([mockComment]), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useComments());
    await act(() => result.current.loadComments());
    expect(result.current.comments).toEqual([mockComment]);
    expect(result.current.nextId).toBe(2);
  });

  test('loadComments でエラーが起きても状態が壊れない', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network error'));
    const { result } = renderHook(() => useComments());
    await act(() => result.current.loadComments());
    expect(result.current.comments).toEqual([]);
  });

  test('addComment でコメントが追加される', async () => {
    const { result } = renderHook(() => useComments());
    await act(() => {
      result.current.addComment(pending, 'hello', result.current.nextId);
    });
    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0].text).toBe('hello');
    expect(result.current.comments[0].id).toBe(1);
    expect(result.current.nextId).toBe(2);
  });

  test('addComment は ls で昇順ソートされる', async () => {
    const { result } = renderHook(() => useComments());
    await act(() => {
      result.current.addComment({ ...pending, ls: 10, le: 10 }, 'second', 1);
    });
    await act(() => {
      result.current.addComment(
        { ...pending, ls: 3, le: 3 },
        'first',
        result.current.nextId,
      );
    });
    expect(result.current.comments[0].ls).toBe(3);
    expect(result.current.comments[1].ls).toBe(10);
  });

  test('addComment に selection_offset がある場合はコメントに含まれる', async () => {
    const { result } = renderHook(() => useComments());
    await act(() => {
      result.current.addComment(
        { ...pending, selection_offset: 5 },
        'sel',
        result.current.nextId,
      );
    });
    expect(result.current.comments[0].selection_offset).toBe(5);
  });

  test('addComment に selection_offset=null の場合はプロパティが含まれない', async () => {
    const { result } = renderHook(() => useComments());
    await act(() => {
      result.current.addComment(pending, 'no sel', result.current.nextId);
    });
    expect('selection_offset' in result.current.comments[0]).toBe(false);
  });

  test('updateComment でテキストが更新される', async () => {
    const { result } = renderHook(() => useComments());
    await act(() => {
      result.current.addComment(pending, 'original', result.current.nextId);
    });
    await act(() => {
      result.current.updateComment(1, 'updated');
    });
    expect(result.current.comments[0].text).toBe('updated');
  });

  test('updateComment: 存在しない id は無視される', async () => {
    const { result } = renderHook(() => useComments());
    await act(() => {
      result.current.addComment(pending, 'keep', result.current.nextId);
    });
    await act(() => {
      result.current.updateComment(99, 'ghost');
    });
    expect(result.current.comments[0].text).toBe('keep');
  });

  test('deleteComment でコメントが削除される', async () => {
    const { result } = renderHook(() => useComments());
    await act(() => {
      result.current.addComment(pending, 'to delete', result.current.nextId);
    });
    await act(() => {
      result.current.deleteComment(1);
    });
    expect(result.current.comments).toHaveLength(0);
  });

  test('clearAll で全コメントが削除されて nextId が 1 にリセットされる', async () => {
    const { result } = renderHook(() => useComments());
    await act(() => {
      result.current.addComment(pending, 'a', 1);
    });
    await act(() => {
      result.current.addComment(
        { ...pending, ls: 5 },
        'b',
        result.current.nextId,
      );
    });
    await act(() => {
      result.current.clearAll();
    });
    expect(result.current.comments).toHaveLength(0);
    expect(result.current.nextId).toBe(1);
  });

  test('addComment は POST /comments を呼ぶ', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() => useComments());
    await act(() => {
      result.current.addComment(pending, 'x', 1);
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/comments',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
