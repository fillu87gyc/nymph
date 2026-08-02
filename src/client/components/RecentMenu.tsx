import { useRef } from 'react';
import { useOutsideDismiss } from '../hooks/useDismiss.ts';
import type { BookmarkEntry, RecentEntry } from '../types.ts';
import styles from './RecentMenu.module.css';

interface RecentMenuProps {
  open: boolean;
  recentFiles: RecentEntry[];
  bookmarks: BookmarkEntry[];
  onToggle: (open: boolean) => void;
  onOpen: (path: string) => void;
  onOpenDir: (path: string) => void;
}

export function RecentMenu({
  open,
  recentFiles,
  bookmarks,
  onToggle,
  onOpen,
  onOpenDir,
}: RecentMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useOutsideDismiss(rootRef, () => onToggle(false), { enabled: open });

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className="btn"
        data-testid="recent-menu-btn"
        data-active={String(open)}
        title="最近開いたファイルとブックマーク"
        onClick={() => onToggle(!open)}
      >
        最近
      </button>
      {open && (
        <div className={styles.dropdown} data-testid="recent-menu">
          <div className={styles.sectionTitle}>最近開いたファイル</div>
          {recentFiles.length === 0 && (
            <div className={styles.empty}>最近開いたファイルはありません</div>
          )}
          {recentFiles.map((f) => (
            <button
              type="button"
              key={f.path}
              className={styles.item}
              data-testid="recent-item"
              onClick={() => {
                onToggle(false);
                onOpen(f.path);
              }}
            >
              <span className={styles.itemName}>{f.name}</span>
              <span className={styles.itemDir}>{f.dir}</span>
            </button>
          ))}
          <div className={styles.sectionTitle}>ブックマーク</div>
          {bookmarks.length === 0 && (
            <div className={styles.empty}>ブックマークはありません</div>
          )}
          {bookmarks.map((b) => (
            <button
              type="button"
              key={b.path}
              className={styles.item}
              data-testid="bookmark-item"
              data-type={b.type}
              onClick={() => {
                onToggle(false);
                if (b.type === 'dir') onOpenDir(b.path);
                else onOpen(b.path);
              }}
            >
              <span className={styles.itemName}>
                {b.type === 'dir' ? '📁 ' : ''}
                {b.name}
              </span>
              <span className={styles.itemDir}>{b.dir}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
