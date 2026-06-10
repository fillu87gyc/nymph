import { useCallback, useState } from 'react';
import type { DiffResponse } from '../types.ts';

export function useDiff() {
  const [diffMode, setDiffMode] = useState(false);
  const [diffData, setDiffData] = useState<DiffResponse | null>(null);
  const [checkpointSet, setCheckpointSet] = useState(false);

  const loadDiff = useCallback(async () => {
    const res = await fetch('/diff');
    const data: DiffResponse = await res.json();
    setDiffData(data);
    // checkpoint はサーバー側でファイルに永続化されるため、
    // リロード後・ファイル切替後もここでボタン状態を復元できる
    setCheckpointSet(Boolean(data.hasCheckpoint));
    return data;
  }, []);

  const setCheckpoint = useCallback(async (): Promise<number> => {
    const res = await fetch('/checkpoint', {
      method: 'POST',
      headers: { 'Content-Length': '0' },
    });
    const data = (await res.json()) as { ok: boolean; lines: number };
    // loadDiff は /diff の hasCheckpoint で checkpointSet を上書きするので、
    // 先に diff を取り直してから「設定済み」を確定させる
    await loadDiff();
    setCheckpointSet(true);
    return data.lines;
  }, [loadDiff]);

  const toggleDiff = useCallback(async () => {
    const next = !diffMode;
    setDiffMode(next);
    if (next) await loadDiff();
  }, [diffMode, loadDiff]);

  // 差分コメントへのジャンプ用: モードを問わず差分チェックモードへ入る
  const showDiff = useCallback(async () => {
    setDiffMode(true);
    await loadDiff();
  }, [loadDiff]);

  return {
    diffMode,
    diffData,
    checkpointSet,
    loadDiff,
    setCheckpoint,
    toggleDiff,
    showDiff,
  };
}
