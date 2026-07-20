import { useEffect, useRef, useState } from 'react';
import { OpenDirButton } from './OpenDirButton.tsx';
import styles from './OverflowMenu.module.css';

interface OverflowMenuProps {
  onPickDir: () => void;
  canCopyPath: boolean;
  onCopyPath: () => void;
  bookmarkActive: boolean;
  canBookmark: boolean;
  onToggleBookmark: () => void;
  checkpointSet: boolean;
  onCheckpoint: () => void;
  onDictSync?: () => void;
  isDictSyncing?: boolean;
  onClearAll: () => void;
}

// 「⋯」オーバーフローメニュー。フォルダを開く / パスをコピー / ブックマーク /
// チェックポイント設定 / 辞書更新 / すべて削除 をまとめる。
// RecentMenu と同じ「外側クリックで閉じる」パターンに加え、Esc でも閉じる。
// 項目クリックでは閉じない（同一操作内で複数の状態確認・連続操作ができるように
// するため。閉じるのは ⋯ ボタンの再クリック・外側クリック・Esc のみ）。
export function OverflowMenu({
  onPickDir,
  canCopyPath,
  onCopyPath,
  bookmarkActive,
  canBookmark,
  onToggleBookmark,
  checkpointSet,
  onCheckpoint,
  onDictSync,
  isDictSyncing,
  onClearAll,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className="btn icon"
        data-testid="overflow-menu-btn"
        data-active={String(open)}
        title="その他の操作"
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className={styles.dropdown} data-testid="overflow-menu">
          <div className={styles.row}>
            <OpenDirButton onPickDir={onPickDir} />
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className="btn icon"
              id="btn-copy-path"
              data-testid="copy-path-btn"
              title="開いているファイルのフルパスをコピー"
              disabled={!canCopyPath}
              onClick={onCopyPath}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 1.5h5.5A1.5 1.5 0 0 1 12 3v7M4.5 4.5H10A1.5 1.5 0 0 1 11.5 6v6a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 12V6a1.5 1.5 0 0 1 1.5-1.5Z"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              パスをコピー
            </button>
          </div>
          {canBookmark && (
            <div className={styles.row}>
              <button
                type="button"
                className="btn icon"
                data-testid="bookmark-toggle"
                data-active={String(bookmarkActive)}
                title={
                  bookmarkActive ? 'ブックマークを解除' : 'ブックマークに追加'
                }
                onClick={onToggleBookmark}
              >
                {bookmarkActive ? '★' : '☆'} ブックマーク
              </button>
            </div>
          )}
          <div className={styles.row}>
            <button
              type="button"
              id="btn-checkpoint"
              className="btn"
              data-has-checkpoint={String(checkpointSet)}
              title="チェックポイントを設定"
              onClick={onCheckpoint}
            >
              📍 チェックポイント設定
            </button>
          </div>
          {onDictSync && (
            <div className={styles.row}>
              <button
                type="button"
                data-testid="dict-fetch-btn"
                className="btn"
                onClick={onDictSync}
                disabled={isDictSyncing}
              >
                {isDictSyncing ? '辞書更新中...' : '辞書更新'}
              </button>
            </div>
          )}
          <div className={styles.divider} />
          <div className={styles.row}>
            <button
              type="button"
              className="btn danger"
              id="btn-clear-all"
              title="コメントを削除"
              onClick={onClearAll}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1.5 3.5h11M5.5 3.5V2.5h3v1M3 3.5l.9 8h6.2l.9-8"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              すべて削除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
