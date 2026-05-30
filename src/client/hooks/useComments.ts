import { useState, useCallback } from 'react';
import type { Comment, PendingComment } from '../types.ts';

export function useComments() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [nextId, setNextId] = useState(1);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch('/comments');
      const data: Comment[] = await res.json();
      setComments(data);
      setNextId(data.length ? Math.max(...data.map(c => c.id)) + 1 : 1);
    } catch { /* ignore */ }
  }, []);

  const saveComments = useCallback((updated: Comment[]) => {
    fetch('/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
  }, []);

  const addComment = useCallback((pending: PendingComment, text: string, currentNextId: number): [Comment[], number] => {
    const c: Comment = {
      id: currentNextId,
      ls: pending.ls,
      le: pending.le,
      block_type: pending.block_type,
      context: pending.context,
      ...(pending.selection_offset != null && { selection_offset: pending.selection_offset }),
      text,
    };
    const updated = [...comments, c].sort((a, b) => a.ls - b.ls);
    setComments(updated);
    setNextId(currentNextId + 1);
    saveComments(updated);
    return [updated, currentNextId + 1];
  }, [comments, saveComments]);

  const updateComment = useCallback((id: number, text: string) => {
    const updated = comments.map(c => c.id === id ? { ...c, text } : c);
    setComments(updated);
    saveComments(updated);
  }, [comments, saveComments]);

  const deleteComment = useCallback((id: number) => {
    const updated = comments.filter(c => c.id !== id);
    setComments(updated);
    saveComments(updated);
  }, [comments, saveComments]);

  const clearAll = useCallback(() => {
    setComments([]);
    setNextId(1);
    saveComments([]);
  }, [saveComments]);

  return { comments, nextId, loadComments, addComment, updateComment, deleteComment, clearAll };
}
