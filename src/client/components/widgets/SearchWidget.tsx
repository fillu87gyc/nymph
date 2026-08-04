import { useState } from 'react';
import { SEARCH_MIN_QUERY, useSearch } from '../../hooks/useSearch.ts';
import { WidgetEmpty, WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface SearchWidgetProps {
  /** 結果を選んだときにファイルを開いて対象行へ飛ぶ。 */
  onOpenFileAtLine: (path: string, line: number) => void;
}

/**
 * 検索結果ウィジェット（VSCode の Search view 相当）。
 *
 * Quick Open（Ctrl/Cmd+P）の「本文の一致」は選ぶと閉じてしまうため、結果を
 * 見ながら次々に確認できる常設パネルとして同じ `/search` を叩く。検索対象と
 * 上限（ファイル 5 件・合計 50 件）はサーバー側と共通。
 */
export function SearchWidget({ onOpenFileAtLine }: SearchWidgetProps) {
  const [query, setQuery] = useState('');
  const { results, truncated } = useSearch(query);
  const total = results.reduce((n, r) => n + r.matches.length, 0);
  const short =
    query.trim().length > 0 && query.trim().length < SEARCH_MIN_QUERY;

  return (
    <WidgetPanel
      title="検索結果"
      testId="search-widget"
      meta={total > 0 ? `${total}件${truncated ? '+' : ''}` : undefined}
      toolbar={
        <div className={styles.toolbar}>
          <input
            className={styles.input}
            data-testid="search-widget-input"
            type="search"
            placeholder="本文を検索…"
            aria-label="本文を検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      }
    >
      {short && <WidgetEmpty>2文字以上で検索します</WidgetEmpty>}
      {!short && query.trim() !== '' && total === 0 && (
        <WidgetEmpty>一致する行がありません</WidgetEmpty>
      )}
      {query.trim() === '' && (
        <WidgetEmpty>
          開いているファイルとツリー配下の .md から探します
        </WidgetEmpty>
      )}
      <div className={styles.list}>
        {results.map((file) => (
          <div key={file.path}>
            <div className={styles.sectionLabel}>{file.name}</div>
            {file.matches.map((m) => (
              <button
                type="button"
                key={`${file.path}:${m.line}`}
                className={`${styles.item} ${styles.itemStack}`}
                data-testid="search-widget-match"
                data-line={m.line}
                title={`${file.name}:${m.line}`}
                onClick={() => onOpenFileAtLine(file.path, m.line)}
              >
                <span className={styles.snippet}>
                  {m.text.slice(0, m.start)}
                  <mark>{m.text.slice(m.start, m.end)}</mark>
                  {m.text.slice(m.end)}
                </span>
                <span className={styles.itemSub}>:{m.line}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </WidgetPanel>
  );
}
