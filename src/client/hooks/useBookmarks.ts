import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { fetcher } from '../lib/fetcher.ts';
import type { BookmarkEntry } from '../types.ts';

export function useBookmarks() {
  const { mutate } = useSWRConfig();

  const { data } = useSWR<{ bookmarks: BookmarkEntry[] }>(
    '/bookmarks',
    fetcher,
    { fallbackData: { bookmarks: [] } },
  );

  const bookmarks = data?.bookmarks ?? [];

  const toggle = useCallback(
    async (path: string, type: 'file' | 'dir') => {
      const res = await fetch('/bookmarks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, type }),
      });
      if (!res.ok)
        throw new Error(`ブックマークを更新できませんでした (${res.status})`);
      const updated = (await res.json()) as {
        bookmarked: boolean;
        bookmarks: BookmarkEntry[];
      };
      await mutate(
        '/bookmarks',
        { bookmarks: updated.bookmarks },
        { revalidate: false },
      );
      return updated.bookmarked;
    },
    [mutate],
  );

  const isBookmarked = useCallback(
    (path: string | null) =>
      path !== null && bookmarks.some((b) => b.path === path),
    [bookmarks],
  );

  return { bookmarks, toggle, isBookmarked };
}
