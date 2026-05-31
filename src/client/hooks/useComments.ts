import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
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
  const { mutate } = useSWRConfig();

  const { data: comments = [] } = useSWR<Comment[]>('/comments', fetcher, {
    fallbackData: [],
  });

  const nextId = comments.length
    ? Math.max(...comments.map((c) => c.id)) + 1
    : 1;

  const saveComments = useCallback(
    async (updated: Comment[]) => {
      await mutate('/comments', updated, { revalidate: false });
      postComments(updated);
    },
    [mutate],
  );

  const addComment = useCallback(
    async (pending: PendingComment, text: string) => {
      const c: Comment = {
        id: nextId,
        ls: pending.ls,
        le: pending.le,
        block_type: pending.block_type,
        context: pending.context,
        ...(pending.selection_offset != null && {
          selection_offset: pending.selection_offset,
        }),
        text,
      };
      const updated = [...comments, c].sort((a, b) => a.ls - b.ls);
      await saveComments(updated);
    },
    [comments, nextId, saveComments],
  );

  const updateComment = useCallback(
    async (id: number, text: string) => {
      const updated = comments.map((c) => (c.id === id ? { ...c, text } : c));
      await saveComments(updated);
    },
    [comments, saveComments],
  );

  const deleteComment = useCallback(
    async (id: number) => {
      const updated = comments.filter((c) => c.id !== id);
      await saveComments(updated);
    },
    [comments, saveComments],
  );

  const clearAll = useCallback(async () => {
    await saveComments([]);
  }, [saveComments]);

  return {
    comments,
    nextId,
    addComment,
    updateComment,
    deleteComment,
    clearAll,
  };
}
