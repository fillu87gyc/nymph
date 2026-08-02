import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearch } from '../hooks/useSearch.ts';
import {
  buildMatchItems,
  buildQuickOpenItems,
  type QuickOpenItem,
  type QuickOpenMatchItem,
} from '../lib/quickOpen.ts';
import type {
  BookmarkEntry,
  FileEntry,
  RecentEntry,
  TreeNode,
} from '../types.ts';
import styles from './QuickOpen.module.css';

interface QuickOpenProps {
  tabs: FileEntry[];
  recentFiles: RecentEntry[];
  bookmarks: BookmarkEntry[];
  tree: TreeNode[];
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onOpenDir: (path: string) => void;
  onOpenFileAtLine: (path: string, line: number) => void;
}

/**
 * Ctrl/Cmd+P のコマンドパレット。
 *
 * 以前は open prop を Effect で見張って入力とカーソルを初期化していたが、これは
 * 公式が挙げる「prop が変わったら state をリセットする」アンチパターン。開いて
 * いる間だけ呼び出し側がマウントするようにしたので、初期化は useState の初期値
 * で足りる（公式の「key で state をリセットする」と同じ考え方）。
 */
export function QuickOpen({
  tabs,
  recentFiles,
  bookmarks,
  tree,
  onClose,
  onOpenFile,
  onOpenDir,
  onOpenFileAtLine,
}: QuickOpenProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => buildQuickOpenItems(tabs, recentFiles, bookmarks, tree, query),
    [tabs, recentFiles, bookmarks, tree, query],
  );

  // 本文の全文検索（/search）。パレットが開いている間だけマウントされる。
  const { results: searchResults, truncated } = useSearch(query);
  const matchItems = useMemo(
    () => buildMatchItems(searchResults),
    [searchResults],
  );

  // ↑↓ はファイル候補 → 本文マッチの通し番号で移動する
  const totalCount = items.length + matchItems.length;

  // 検索結果の到着で件数が減っても選択位置がはみ出さないようにする。
  // Effect で state を詰め直すと余分な再描画が 1 往復増えるので、
  // 公式の「レンダー中に計算できるものは state にしない」に従って導出する。
  const selected = Math.min(selectedIndex, Math.max(0, totalCount - 1));

  // マウント時に入力へフォーカスする（宣言的な API が無い DOM 操作なので Effect が正しい）
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ↑↓ 移動時に選択行を画面内へ追従させる
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  function pick(item: QuickOpenItem) {
    onClose();
    if (item.type === 'dir') onOpenDir(item.path);
    else onOpenFile(item.path);
  }

  function pickMatch(item: QuickOpenMatchItem) {
    onClose();
    onOpenFileAtLine(item.path, item.line);
  }

  function pickSelected() {
    if (selected < items.length) {
      const item = items[selected];
      if (item) pick(item);
      return;
    }
    const match = matchItems[selected - items.length];
    if (match) pickMatch(match);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // クランプ後の selected を基準にする（生の state だと、件数が減った直後の
      // ↑ が画面上の選択位置から連続せずに飛んでしまう）
      setSelectedIndex(Math.min(selected + 1, totalCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(Math.max(selected - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickSelected();
    }
  }

  return (
    <div
      className={styles.overlay}
      data-testid="quick-open"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.palette}>
        <input
          ref={inputRef}
          className={styles.input}
          data-testid="quick-open-input"
          placeholder="ファイル名・本文で検索…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.list} ref={listRef}>
          {totalCount === 0 && (
            <div className={styles.empty}>該当するファイルがありません</div>
          )}
          {items.map((item, i) => (
            <button
              type="button"
              key={item.path}
              className={styles.item}
              data-testid="quick-open-item"
              data-selected={String(i === selected)}
              data-type={item.type}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => pick(item)}
            >
              <span className={styles.itemName}>
                {item.type === 'dir' ? '📁 ' : ''}
                {item.name}
              </span>
              <span className={styles.itemDetail}>{item.detail}</span>
            </button>
          ))}
          {matchItems.length > 0 && (
            <div className={styles.sectionLabel}>
              本文の一致{truncated ? '（一部のみ表示）' : ''}
            </div>
          )}
          {matchItems.map((m, i) => (
            <button
              type="button"
              key={`${m.path}:${m.line}`}
              className={styles.matchItem}
              data-testid="quick-open-match"
              data-selected={String(items.length + i === selected)}
              onMouseEnter={() => setSelectedIndex(items.length + i)}
              onClick={() => pickMatch(m)}
            >
              <span className={styles.matchHead}>
                <span className={styles.itemName}>{m.name}</span>
                <span className={styles.matchLine}>:{m.line}</span>
              </span>
              {m.before.map((line) => (
                <span key={`b${line}`} className={styles.ctxLine}>
                  {line || ' '}
                </span>
              ))}
              <span className={styles.snippet}>
                {m.text.slice(0, m.start)}
                <mark>{m.text.slice(m.start, m.end)}</mark>
                {m.text.slice(m.end)}
              </span>
              {m.after.map((line) => (
                <span key={`a${line}`} className={styles.ctxLine}>
                  {line || ' '}
                </span>
              ))}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
