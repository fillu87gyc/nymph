import { useCallback } from 'react';
import useSWR from 'swr';
import { fetcher } from '../lib/fetcher.ts';
import type { Comment, PendingComment } from '../types.ts';

function postComments(updated: Comment[]) {
  fetch('/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated),
  }).catch(() => {});
}

export function useComments() {
  const { data: comments = [], mutate } = useSWR<Comment[]>(
    '/comments',
    fetcher,
    { fallbackData: [] },
  );

  const nextId = comments.length
    ? Math.max(...comments.map((c) => c.id)) + 1
    : 1;

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
      if (updated) postComments(updated);
    },
    [mutate],
  );

  const updateComment = useCallback(
    async (id: number, text: string) => {
      const updated = await mutate(
        (current: Comment[] = []) =>
          current.map((c) => (c.id === id ? { ...c, text } : c)),
        { revalidate: false },
      );
      if (updated) postComments(updated);
    },
    [mutate],
  );

  const deleteComment = useCallback(
    async (id: number) => {
      const updated = await mutate(
        (current: Comment[] = []) => current.filter((c) => c.id !== id),
        { revalidate: false },
      );
      if (updated) postComments(updated);
    },
    [mutate],
  );

  const clearAll = useCallback(async () => {
    const updated = await mutate(() => [] as Comment[], { revalidate: false });
    if (updated) postComments(updated);
  }, [mutate]);

  return {
    comments,
    nextId,
    addComment,
    updateComment,
    deleteComment,
    clearAll,
  };
}
