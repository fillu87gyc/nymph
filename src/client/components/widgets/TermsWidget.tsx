import { useMemo, useState } from 'react';
import { findTermLines } from '../../lib/docScan.ts';
import type { DictEntry } from '../../types.ts';
import { WidgetEmpty, WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface TermsWidgetProps {
  entries: DictEntry[];
  source: string;
  onSelectLine: (line: number) => void;
}

/**
 * 用語集ウィジェット。
 *
 * 辞書（`.nymph/dict.json`）の用語は本文中のホバーでしか見られず、「どんな
 * 用語が定義されているか」を一覧する手段が無かった。ここでは全用語を並べ、
 * 本文に出てくるものは出現回数を添えて、選ぶと最初の出現行へ飛ばす。
 */
export function TermsWidget({
  entries,
  source,
  onSelectLine,
}: TermsWidgetProps) {
  const [query, setQuery] = useState('');

  // 用語ごとの本文中の出現行。辞書か本文が変わったときだけ数え直す。
  const occurrences = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const e of entries) {
      map.set(e.term, findTermLines(source, e.term, e.aliases));
    }
    return map;
  }, [entries, source]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? entries.filter(
        (e) =>
          e.term.toLowerCase().includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q)) ||
          e.definition.toLowerCase().includes(q),
      )
    : entries;

  return (
    <WidgetPanel
      title="用語集"
      testId="terms-widget"
      meta={entries.length > 0 ? `${entries.length}` : undefined}
      toolbar={
        entries.length > 0 ? (
          <div className={styles.toolbar}>
            <input
              className={styles.input}
              data-testid="terms-widget-filter"
              type="search"
              placeholder="用語を絞り込む…"
              aria-label="用語を絞り込む"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        ) : undefined
      }
    >
      {entries.length === 0 && (
        <WidgetEmpty>
          辞書が空です。`.nymph/dict.json` を用意すると用語が並びます
        </WidgetEmpty>
      )}
      {entries.length > 0 && shown.length === 0 && (
        <WidgetEmpty>一致する用語がありません</WidgetEmpty>
      )}
      <div className={styles.list}>
        {shown.map((e) => {
          const lines = occurrences.get(e.term) ?? [];
          return (
            <button
              type="button"
              key={e.term}
              className={`${styles.item} ${styles.itemStack}`}
              data-testid="terms-widget-item"
              data-term={e.term}
              data-count={lines.length}
              disabled={lines.length === 0}
              title={
                lines.length === 0
                  ? `${e.term}: 本文には出てきません`
                  : `${e.term}: ${lines.length}箇所（最初は${lines[0]}行目）`
              }
              onClick={() => lines[0] != null && onSelectLine(lines[0])}
            >
              <span className={styles.itemText}>
                {e.term}
                {lines.length > 0 && (
                  <span className={styles.lineNo}> ×{lines.length}</span>
                )}
              </span>
              <span className={styles.itemSub}>{e.definition}</span>
            </button>
          );
        })}
      </div>
    </WidgetPanel>
  );
}
