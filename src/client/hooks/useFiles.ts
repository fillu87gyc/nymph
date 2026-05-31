import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { fetcher } from '../lib/fetcher.ts';
import type { FileEntry } from '../types.ts';

export function useFiles() {
  const { mutate } = useSWRConfig();

  const { data } = useSWR<{ files: FileEntry[]; activeFile: string | null }>(
    '/files',
    fetcher,
    { fallbackData: { files: [], activeFile: null } },
  );

  const files = data?.files ?? [];
  const activeFile = data?.activeFile ?? null;

  const switchFile = useCallback(
    async (path: string) => {
      await fetch('/active-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      await mutate('/files');
    },
    [mutate],
  );

  const closeFile = useCallback(
    async (path: string) => {
      const res = await fetch('/close-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const updated = await res.json();
      await mutate('/files', updated, { revalidate: false });
      return updated.activeFile as string | null;
    },
    [mutate],
  );

  return { files, activeFile, switchFile, closeFile };
}
