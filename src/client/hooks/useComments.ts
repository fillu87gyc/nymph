import { useCallback } from 'react';
import useSWR from 'swr';
import { generateCommentId } from '../lib/commentId.ts';
import { commentsKey } from '../lib/comments.ts';
import { fetcher } from '../lib/fetcher.ts';
import type { Comment, CommentsResponse, PendingComment } from '../types.ts';

const EMPTY_RESPONSE: CommentsResponse = { round: 0, comments: [] };

// 保存先ファイルを明示した URL に POST する。レスポンスが失敗した場合は
// サイレントに諦めず呼び出し元に伝える（呼び出し元は SWR キャッシュを
// 再検証して実状態に合わせる）。POST の body は従来どおり comments 配列の
// ままにし、round はサーバー側（reviewStore.ts）が既存値を保持する。
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
  const { data, mutate } = useSWR<CommentsResponse>(key, fetcher, {
    fallbackData: EMPTY_RESPONSE,
  });
  const comments = data?.comments ?? [];
  const round = data?.round ?? 0;

  // 保存に失敗したら、ローカルの楽観的更新を実際のサーバー状態で
  // 上書きする（revalidate）ことで、消えたはずのコメントが UI 上だけ
  // 残ってしまう食い違いを防ぐ。
  async function save(updatedComments: Comment[]): Promise<boolean> {
    const ok = await postComments(key, updatedComments);
    if (!ok) await mutate();
    return ok;
  }

  const addComment = useCallback(
    async (pending: PendingComment, text: string) => {
      // 関数形式で渡すことで SWR がキャッシュ現在値を渡してくれ、stale closure を回避できる
      const updated = await mutate(
        (current: CommentsResponse = EMPTY_RESPONSE) => {
          const id = generateCommentId(current.comments.map((c) => c.id));
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
            createdAt: new Date().toISOString(),
            round: current.round,
          };
          const nextComments = [...current.comments, c].sort(
            (a, b) => a.lineStart - b.lineStart,
          );
          return { round: current.round, comments: nextComments };
        },
        { revalidate: false },
      );
      return updated ? save(updated.comments) : true;
    },
    [mutate, key],
  );

  const updateComment = useCallback(
    async (id: Comment['id'], text: string) => {
      const updated = await mutate(
        (current: CommentsResponse = EMPTY_RESPONSE) => ({
          round: current.round,
          comments: current.comments.map((c) =>
            c.id === id ? { ...c, text } : c,
          ),
        }),
        { revalidate: false },
      );
      return updated ? save(updated.comments) : true;
    },
    [mutate, key],
  );

  const deleteComment = useCallback(
    async (id: Comment['id']) => {
      const updated = await mutate(
        (current: CommentsResponse = EMPTY_RESPONSE) => ({
          round: current.round,
          comments: current.comments.filter((c) => c.id !== id),
        }),
        { revalidate: false },
      );
      return updated ? save(updated.comments) : true;
    },
    [mutate, key],
  );

  const toggleResolved = useCallback(
    async (id: Comment['id']) => {
      const updated = await mutate(
        (current: CommentsResponse = EMPTY_RESPONSE) => ({
          round: current.round,
          comments: current.comments.map((c) =>
            c.id === id ? { ...c, resolved: !c.resolved } : c,
          ),
        }),
        { revalidate: false },
      );
      return updated ? save(updated.comments) : true;
    },
    [mutate, key],
  );

  const clearAll = useCallback(async () => {
    const updated = await mutate(
      (current: CommentsResponse = EMPTY_RESPONSE) => ({
        round: current.round,
        comments: [],
      }),
      { revalidate: false },
    );
    return updated ? save(updated.comments) : true;
  }, [mutate, key]);

  const clearOrphaned = useCallback(
    async (ids: Set<Comment['id']>) => {
      const updated = await mutate(
        (current: CommentsResponse = EMPTY_RESPONSE) => ({
          round: current.round,
          comments: current.comments.filter((c) => !ids.has(c.id)),
        }),
        { revalidate: false },
      );
      return updated ? save(updated.comments) : true;
    },
    [mutate, key],
  );

  return {
    comments,
    round,
    addComment,
    updateComment,
    deleteComment,
    toggleResolved,
    clearAll,
    clearOrphaned,
  };
}
