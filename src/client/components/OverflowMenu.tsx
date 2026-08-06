import { useRef, useState } from 'react';
import { useEscapeDismiss, useOutsideDismiss } from '../hooks/useDismiss.ts';
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
  /** ブラウザの印刷ダイアログを開く（そのまま PDF に保存できる）。 */
  onPrint: () => void;
  onDictSync?: () => void;
  isDictSyncing?: boolean;
  onClearAll: () => void;
}

// 「⋯」オーバーフローメニュー。フォルダを開く / パスをコピー / ブックマーク /
// チェックポイント設定 / 印刷 / 辞書更新 / すべて削除 をまとめる。
// RecentMenu と同じ「外側クリックで閉じる」パターンに加え、Esc でも閉じる。
// 項目クリックは一律メニューを閉じてから実行する（一般的なドロップダウンの
// 作法に合わせる。「すべて削除」の確認モーダルや「フォルダを開く」の OS
// ダイアログの背後にメニューが開いたまま残らないようにするため）。
export function OverflowMenu({
  onPickDir,
  canCopyPath,
  onCopyPath,
  bookmarkActive,
  canBookmark,
  onToggleBookmark,
  checkpointSet,
  onCheckpoint,
  onPrint,
  onDictSync,
  isDictSyncing,
  onClearAll,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 項目実行前にメニューを閉じる（全項目共通）
  function runAndClose(action: () => void) {
    setOpen(false);
    action();
  }

  useOutsideDismiss(rootRef, () => setOpen(false), { enabled: open });
  useEscapeDismiss(() => setOpen(false), open);

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
            <OpenDirButton onPickDir={() => runAndClose(onPickDir)} />
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className="btn icon"
              id="btn-copy-path"
              data-testid="copy-path-btn"
              title="開いているファイルのフルパスをコピー"
              disabled={!canCopyPath}
              onClick={() => runAndClose(onCopyPath)}
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
                onClick={() => runAndClose(onToggleBookmark)}
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
              onClick={() => runAndClose(onCheckpoint)}
            >
              📍 チェックポイント設定
            </button>
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className="btn"
              id="btn-print"
              data-testid="print-btn"
              title="本文を印刷する（PDF に保存できます）"
              onClick={() => runAndClose(onPrint)}
            >
              🖨 印刷 / PDF
            </button>
          </div>
          {onDictSync && (
            <div className={styles.row}>
              <button
                type="button"
                data-testid="dict-fetch-btn"
                className="btn"
                onClick={() => runAndClose(onDictSync)}
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
              onClick={() => runAndClose(onClearAll)}
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
