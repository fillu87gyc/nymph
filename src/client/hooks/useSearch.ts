import { useEffect, useRef, useState } from 'react';
import type { SearchFileResult, SearchResponse } from '../types.ts';

/** 1文字クエリはノイズが多いので投げない（mo と同様の閾値） */
export const SEARCH_MIN_QUERY = 2;
const DEBOUNCE_MS = 120;

/**
 * /search を叩く全文検索フック。タイプ中の連打を避けるためデバウンスし、
 * 入力が進んで古くなったレスポンスは捨てる（後勝ちを保証する）。
 */
export function useSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<SearchFileResult[]>([]);
  const [truncated, setTruncated] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < SEARCH_MIN_QUERY) {
      seqRef.current++;
      setResults([]);
      setTruncated(false);
      return;
    }
    const seq = ++seqRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/search?q=${encodeURIComponent(q)}`);
          if (!res.ok) return;
          const data = (await res.json()) as SearchResponse;
          if (seqRef.current !== seq) return;
          setResults(data.results);
          setTruncated(data.truncated);
        } catch {
          /* ネットワークエラー時は前回の結果を維持する */
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, enabled]);

  return { results, truncated };
}
