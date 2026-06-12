import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { fetcher } from '../lib/fetcher.ts';
import type { TreeResponse } from '../types.ts';

export function useTree() {
  const { mutate } = useSWRConfig();

  const { data } = useSWR<TreeResponse>('/tree', fetcher, {
    fallbackData: { root: null, tree: [] },
  });

  // ツリーのルートを切り替える（開いているタブは維持される）
  const openDir = useCallback(
    async (path: string) => {
      const res = await fetch('/open-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok)
        throw new Error(`ディレクトリを開けませんでした (${res.status})`);
      const updated = await res.json();
      await mutate('/tree', updated, { revalidate: false });
    },
    [mutate],
  );

  return {
    root: data?.root ?? null,
    rootName: data?.rootName ?? '',
    tree: data?.tree ?? [],
    openDir,
  };
}
