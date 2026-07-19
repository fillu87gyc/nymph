import { useCallback } from 'react';
import useSWR from 'swr';
import { commentsKey } from '../lib/comments.ts';
import { fetcher } from '../lib/fetcher.ts';
import type { Comment, PendingComment } from '../types.ts';

// 保存先ファイルを明示した URL に POST する。レスポンスが失敗した場合は
// サイレントに諦めず呼び出し元に伝える（呼び出し元は SWR キャッシュを
// 再検証して実状態に合わせる）。
async function postComments(key: string, updated: Comment[]): Promise<boolean> {
  try {
    const res = await fetch(key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useComments(activeFile: string | null = null) {
  const key = commentsKey(activeFile);
  const { data: comments = [], mutate } = useSWR<Comment[]>(key, fetcher, {
    fallbackData: [],
  });

  const nextId = comments.length
    ? Math.max(...comments.map((c) => c.id)) + 1
    : 1;

  // 保存に失敗したら、ローカルの楽観的更新を実際のサーバー状態で
  // 上書きする（revalidate）ことで、消えたはずのコメントが UI 上だけ
  // 残ってしまう食い違いを防ぐ。
  async function save(updated: Comment[]): Promise<boolean> {
    const ok = await postComments(key, updated);
    if (!ok) await mutate();
    return ok;
  }

  const addComment = useCallback(
    async (pending: PendingComment, text: string) => {
      // 関数形式で渡すことで SWR がキャッシュ現在値を渡してくれ、stale closure を回避できる
      const updated = await mutate(
        (current: Comment[] = []) => {
          const id = current.length
            ? Math.max(...current.map((c) => c.id)) + 1
            : 1;
          const c: Comment = {
            id,
            lineStart: pending.lineStart,
            lineEnd: pending.lineEnd,
            block_type: pending.block_type,
            context: pending.context,
            ...(pending.selection_offset != null && {
              selection_offset: pending.selection_offset,
            }),
            text,
          };
          return [...current, c].sort((a, b) => a.lineStart - b.lineStart);
        },
        { revalidate: false },
      );
      return updated ? save(updated) : true;
    },
    [mutate, key],
  );

  const updateComment = useCallback(
    async (id: number, text: string) => {
      const updated = await mutate(
        (current: Comment[] = []) =>
          current.map((c) => (c.id === id ? { ...c, text } : c)),
        { revalidate: false },
      );
      return updated ? save(updated) : true;
    },
    [mutate, key],
  );

  const deleteComment = useCallback(
    async (id: number) => {
      const updated = await mutate(
        (current: Comment[] = []) => current.filter((c) => c.id !== id),
        { revalidate: false },
      );
      return updated ? save(updated) : true;
    },
    [mutate, key],
  );

  const clearAll = useCallback(async () => {
    const updated = await mutate(() => [] as Comment[], { revalidate: false });
    return updated ? save(updated) : true;
  }, [mutate, key]);

  const clearOrphaned = useCallback(
    async (ids: Set<number>) => {
      const updated = await mutate(
        (current: Comment[] = []) => current.filter((c) => !ids.has(c.id)),
        { revalidate: false },
      );
      return updated ? save(updated) : true;
    },
    [mutate, key],
  );

  return {
    comments,
    nextId,
    addComment,
    updateComment,
    deleteComment,
    clearAll,
    clearOrphaned,
  };
}
