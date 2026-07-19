import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useComments } from '../../src/client/hooks/useComments.ts';
import type { Comment, PendingComment } from '../../src/client/types.ts';

const mockComment: Comment = {
  id: 1,
  lineStart: 2,
  lineEnd: 4,
  block_type: 'paragraph',
  context: 'test context',
  text: 'test comment',
};

const pending: PendingComment = {
  lineStart: 2,
  lineEnd: 4,
  block_type: 'paragraph',
  context: 'test context',
  selection_offset: null,
};

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(
    SWRConfig,
    {
      value: {
        provider: () => new Map(),
        dedupingInterval: 0,
        // act() が jsdom の focus/reconnect イベントを発火させ SWR が再フェッチするのを防ぐ
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      },
    },
    children,
  );

// ---- ステートフル fetch モック ----
// GET はサーバー状態を返し、POST はサーバー状態を更新する。
// こうすることで SWR が revalidation を行っても現在の状態が返り、
// mutate の結果がキャッシュから消えなくなる。
let serverComments: Comment[] = [];
let postShouldFail = false;

beforeEach(() => {
  serverComments = [];
  postShouldFail = false;
  vi.spyOn(global, 'fetch').mockImplementation(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
        if (postShouldFail) return new Response('error', { status: 400 });
        serverComments = JSON.parse((init as RequestInit).body as string);
        return new Response('ok', { status: 200 });
      }
      return new Response(JSON.stringify(serverComments), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// SWR の初期フェッチが完了するまで待つヘルパー
async function waitForReady(result: {
  current: ReturnType<typeof useComments>;
}) {
  await waitFor(() =>
    expect(Array.isArray(result.current.comments)).toBe(true),
  );
  // 初回フェッチチェーン (fetch → r.json() → SWR setState) が複数マイクロタスクにまたがる。
  // macrotask に yield して全チェーンを完結させてから次に進む。
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe('useComments', () => {
  test('初期状態: fallbackData として コメント空・nextId=1', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useComments(), { wrapper });
    expect(result.current.comments).toEqual([]);
    expect(result.current.nextId).toBe(1);
  });

  test('マウント後 SWR がコメントを取得する', async () => {
    serverComments = [mockComment];
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitFor(() => {
      expect(result.current.comments).toEqual([mockComment]);
      expect(result.current.nextId).toBe(2);
    });
  });

  test('addComment でコメントが追加される', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'hello'));
    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0].text).toBe('hello');
    expect(result.current.comments[0].id).toBe(1);
    expect(result.current.nextId).toBe(2);
  });

  test('addComment は lineStart で昇順ソートされる', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() =>
      result.current.addComment(
        { ...pending, lineStart: 10, lineEnd: 10 },
        'second',
      ),
    );
    await act(() =>
      result.current.addComment(
        { ...pending, lineStart: 3, lineEnd: 3 },
        'first',
      ),
    );
    expect(result.current.comments[0].lineStart).toBe(3);
    expect(result.current.comments[1].lineStart).toBe(10);
  });

  test('addComment に selection_offset がある場合はコメントに含まれる', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() =>
      result.current.addComment({ ...pending, selection_offset: 5 }, 'sel'),
    );
    expect(result.current.comments[0].selection_offset).toBe(5);
  });

  test('addComment に selection_offset=null の場合はプロパティが含まれない', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'no sel'));
    expect('selection_offset' in result.current.comments[0]).toBe(false);
  });

  test('updateComment でテキストが更新される', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'original'));
    await act(() => result.current.updateComment(1, 'updated'));
    expect(result.current.comments[0].text).toBe('updated');
  });

  test('updateComment: 存在しない id は無視される', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'keep'));
    await act(() => result.current.updateComment(99, 'ghost'));
    expect(result.current.comments[0].text).toBe('keep');
  });

  test('deleteComment でコメントが削除される', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'to delete'));
    await act(() => result.current.deleteComment(1));
    expect(result.current.comments).toHaveLength(0);
  });

  test('clearAll で全コメントが削除されて nextId が 1 にリセットされる', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'a'));
    await act(() =>
      result.current.addComment({ ...pending, lineStart: 5 }, 'b'),
    );
    await act(() => result.current.clearAll());
    expect(result.current.comments).toHaveLength(0);
    expect(result.current.nextId).toBe(1);
  });

  test('clearOrphaned で指定 id のコメントのみ削除される', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'orphaned'));
    await act(() =>
      result.current.addComment({ ...pending, lineStart: 5 }, 'keep'),
    );
    expect(result.current.comments).toHaveLength(2);
    const orphanedId = result.current.comments[0].id;
    await act(() => result.current.clearOrphaned(new Set([orphanedId])));
    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0].text).toBe('keep');
  });

  test('clearOrphaned に空の Set を渡すとコメントは変わらない', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'keep'));
    await act(() => result.current.clearOrphaned(new Set()));
    expect(result.current.comments).toHaveLength(1);
  });

  test('addComment は POST /comments を呼ぶ', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'x'));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/comments',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('activeFile を渡すと /comments?file=... を GET/POST する', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() => useComments('/tmp/a.md'), {
      wrapper,
    });
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/comments?file=%2Ftmp%2Fa.md'),
    );
    await act(() => result.current.addComment(pending, 'x'));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/comments?file=%2Ftmp%2Fa.md',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('__dropped__ のときは file パラメータなしの /comments を使う', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    renderHook(() => useComments('__dropped__'), { wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/comments'));
  });

  test('保存に失敗すると addComment は false を返し、キャッシュを再検証する', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);

    postShouldFail = true;
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.addComment(pending, 'will fail');
    });
    expect(ok).toBe(false);

    // revalidate によりサーバー側の実状態（空のまま）に揃う
    await waitFor(() => {
      expect(result.current.comments).toEqual([]);
    });
  });

  test('保存に成功すると addComment は true を返す', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.addComment(pending, 'ok');
    });
    expect(ok).toBe(true);
  });

  test('保存に失敗すると deleteComment は false を返す', async () => {
    const { result } = renderHook(() => useComments(), { wrapper });
    await waitForReady(result);
    await act(() => result.current.addComment(pending, 'to delete'));

    postShouldFail = true;
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.deleteComment(1);
    });
    expect(ok).toBe(false);
  });
});
