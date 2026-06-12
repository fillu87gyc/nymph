import { useEffect, useRef } from 'react';
import type { RecentEntry } from '../types.ts';
import styles from './RecentMenu.module.css';

interface RecentMenuProps {
  open: boolean;
  recentFiles: RecentEntry[];
  onToggle: (open: boolean) => void;
  onOpen: (path: string) => void;
}

export function RecentMenu({
  open,
  recentFiles,
  onToggle,
  onOpen,
}: RecentMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      onToggle(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, onToggle]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className="btn"
        data-testid="recent-menu-btn"
        data-active={String(open)}
        title="最近開いたファイル (Ctrl+R)"
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
        </div>
      )}
    </div>
  );
}
