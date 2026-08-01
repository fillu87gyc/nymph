import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { isCommentsKey } from '../lib/comments.ts';
import { fetcher } from '../lib/fetcher.ts';
import type { FileEntry } from '../types.ts';

export function useFiles() {
  const { mutate } = useSWRConfig();

  const { data } = useSWR<{
    files: FileEntry[];
    activeFile: string | null;
  }>('/files', fetcher);

  const files = data?.files ?? [];
  const activeFile = data?.activeFile ?? null;
  // isLoading は data 確定と別の state 更新で1テック遅れうるため使わない。
  // data そのものの有無で判定し、filesLoaded と activeFile が必ず同じ
  // レンダーで一致した値になるようにする（さもないと一瞬 activeFile=null
  // 扱いのまま file 無しの /comments・/content を叩いてしまう）。
  const filesLoaded = data !== undefined;

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

  // 履歴・ツリーなどタブ外からファイルを開く（タブに追加してアクティブ化）
  const openFile = useCallback(
    async (path: string) => {
      const res = await fetch('/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok)
        throw new Error(`ファイルを開けませんでした (${res.status})`);
      const updated = await res.json();
      await mutate('/files', updated, { revalidate: false });
      await mutate('/recent');
      await mutate(isCommentsKey);
    },
    [mutate],
  );

  // OS ネイティブのファイル選択ダイアログを起動し、選択されたら開く
  const pickFile = useCallback(async () => {
    const res = await fetch('/pick-file', { method: 'POST' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || 'ダイアログを開けませんでした');
    }
    const { path } = (await res.json()) as { path: string | null };
    if (path) await openFile(path);
  }, [openFile]);

  return {
    files,
    activeFile,
    filesLoaded,
    switchFile,
    closeFile,
    openFile,
    pickFile,
  };
}
