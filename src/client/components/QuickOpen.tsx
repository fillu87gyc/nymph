import { useEffect, useMemo, useRef, useState } from 'react';
import { buildQuickOpenItems, type QuickOpenItem } from '../lib/quickOpen.ts';
import type {
  BookmarkEntry,
  FileEntry,
  RecentEntry,
  TreeNode,
} from '../types.ts';
import styles from './QuickOpen.module.css';

interface QuickOpenProps {
  open: boolean;
  tabs: FileEntry[];
  recentFiles: RecentEntry[];
  bookmarks: BookmarkEntry[];
  tree: TreeNode[];
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onOpenDir: (path: string) => void;
}

export function QuickOpen({
  open,
  tabs,
  recentFiles,
  bookmarks,
  tree,
  onClose,
  onOpenFile,
  onOpenDir,
}: QuickOpenProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => buildQuickOpenItems(tabs, recentFiles, bookmarks, tree, query),
    [tabs, recentFiles, bookmarks, tree, query],
  );

  // 開くたびに初期化してフォーカス
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    inputRef.current?.focus();
  }, [open]);

  // ↑↓ 移動時に選択行を画面内へ追従させる
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  function pick(item: QuickOpenItem) {
    onClose();
    if (item.type === 'dir') onOpenDir(item.path);
    else onOpenFile(item.path);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selected];
      if (item) pick(item);
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
          placeholder="ファイル名で検索…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.list} ref={listRef}>
          {items.length === 0 && (
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
              onMouseEnter={() => setSelected(i)}
              onClick={() => pick(item)}
            >
              <span className={styles.itemName}>
                {item.type === 'dir' ? '📁 ' : ''}
                {item.name}
              </span>
              <span className={styles.itemDetail}>{item.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
