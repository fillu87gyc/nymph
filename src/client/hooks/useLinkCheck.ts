import { useEffect, useState } from 'react';

/** 行き先ごとの判定。true=実在 / false=見つからない / null=未確認（範囲外）。 */
export type LinkStatus = Map<string, boolean | null>;

interface LinkCheckResponse {
  results: { target: string; exists: boolean | null; isDir?: boolean }[];
}

/**
 * 相対リンクの生死をサーバー（POST /link-check）に問い合わせる。
 *
 * 対象は本文が変わるたびに作り直されるので、配列の同一性ではなく中身を
 * キーにして、同じ顔ぶれなら問い合わせ直さない。応答が遅れているあいだに
 * 別のファイルへ移った場合の後勝ちも、この effect の後片付けで保証する。
 */
export function useLinkCheck(targets: string[]): LinkStatus {
  const key = targets.join('\n');
  const [status, setStatus] = useState<LinkStatus>(() => new Map());

  useEffect(() => {
    if (!key) {
      setStatus(new Map());
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const res = await fetch('/link-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets: key.split('\n') }),
        });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as LinkCheckResponse;
        if (!alive) return;
        setStatus(new Map(data.results.map((r) => [r.target, r.exists])));
      } catch {
        // 判定できないだけなので、一覧は未確認のまま出す
      }
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  return status;
}
