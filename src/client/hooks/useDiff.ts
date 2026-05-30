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
    return data;
  }, []);

  const setCheckpoint = useCallback(async (): Promise<number> => {
    const res = await fetch('/checkpoint', {
      method: 'POST',
      headers: { 'Content-Length': '0' },
    });
    const data = (await res.json()) as { ok: boolean; lines: number };
    setCheckpointSet(true);
    if (diffMode) await loadDiff();
    return data.lines;
  }, [diffMode, loadDiff]);

  const toggleDiff = useCallback(async () => {
    const next = !diffMode;
    setDiffMode(next);
    if (next) await loadDiff();
    else setDiffData(null);
  }, [diffMode, loadDiff]);

  return {
    diffMode,
    diffData,
    checkpointSet,
    loadDiff,
    setCheckpoint,
    toggleDiff,
  };
}
