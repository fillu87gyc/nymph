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

  // OS ネイティブのフォルダ選択ダイアログを起動し、選択されたらルートを切り替える
  const pickDir = useCallback(async () => {
    const res = await fetch('/pick-dir', { method: 'POST' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || 'ダイアログを開けませんでした');
    }
    const { path } = (await res.json()) as { path: string | null };
    if (path) await openDir(path);
  }, [openDir]);

  return {
    root: data?.root ?? null,
    rootName: data?.rootName ?? '',
    tree: data?.tree ?? [],
    openDir,
    pickDir,
  };
}
