import type { BookmarkEntry, FileEntry, RecentEntry } from '../types.ts';
import { FileTabs } from './FileTabs.tsx';
import { OpenDirButton } from './OpenDirButton.tsx';
import { RecentMenu } from './RecentMenu.tsx';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  version: string;
  updateTime: string;
  commentCount: number;
  diffMode: boolean;
  checkpointSet: boolean;
  isConnected: boolean;
  files: FileEntry[];
  activeFile: string | null;
  recentFiles: RecentEntry[];
  recentOpen: boolean;
  bookmarks: BookmarkEntry[];
  bookmarkActive: boolean;
  canBookmark: boolean;
  onToggleBookmark: () => void;
  onToggleRecent: (open: boolean) => void;
  onOpenFile: (path: string) => void;
  onOpenDir: (path: string) => void;
  onTogglePanel: () => void;
  onCopyReview: () => void;
  onClearAll: () => void;
  onCheckpoint: () => void;
  onToggleDiff: () => void;
  onToggleTheme: () => void;
  onSwitchFile: (path: string) => void;
  onCloseFile: (path: string) => void;
  onDictSync?: () => void;
  isDictSyncing?: boolean;
}

export function Toolbar({
  version,
  updateTime,
  commentCount,
  diffMode,
  checkpointSet,
  isConnected,
  files,
  activeFile,
  recentFiles,
  recentOpen,
  bookmarks,
  bookmarkActive,
  canBookmark,
  onToggleBookmark,
  onToggleRecent,
  onOpenFile,
  onOpenDir,
  onTogglePanel,
  onCopyReview,
  onClearAll,
  onCheckpoint,
  onToggleDiff,
  onToggleTheme,
  onSwitchFile,
  onCloseFile,
  onDictSync,
  isDictSyncing,
}: ToolbarProps) {
  return (
    <header id="toolbar" className={styles.toolbar}>
      <span className={styles.brand} data-testid="brand">
        nymph
        {version && (
          <span className={styles.brandVersion} data-testid="brand-version">
            {version}
          </span>
        )}
      </span>
      {updateTime && (
        <span className={styles.updateTime} id="update-time">
          {updateTime}
        </span>
      )}
      <span className="sep" />
      <RecentMenu
        open={recentOpen}
        recentFiles={recentFiles}
        bookmarks={bookmarks}
        onToggle={onToggleRecent}
        onOpen={onOpenFile}
        onOpenDir={onOpenDir}
      />
      <OpenDirButton onOpenDir={onOpenDir} />
      {canBookmark && (
        <button
          type="button"
          className="btn icon"
          data-testid="bookmark-toggle"
          data-active={String(bookmarkActive)}
          title={bookmarkActive ? 'ブックマークを解除' : 'ブックマークに追加'}
          onClick={onToggleBookmark}
        >
          {bookmarkActive ? '★' : '☆'}
        </button>
      )}
      <FileTabs
        files={files}
        activeFile={activeFile}
        onSwitch={onSwitchFile}
        onClose={onCloseFile}
      />
      <span
        id="connection-status"
        className={styles.connectionStatus}
        data-connected={String(isConnected)}
      >
        <span
          className={styles.connectionDot}
          data-testid="connection-dot"
          data-connected={String(isConnected)}
        />
        <span className={styles.connectionLabel}>
          {isConnected ? 'コネクション' : '切断'}
        </span>
      </span>
      <span className="spacer" />
      <button className="btn" id="btn-comments" onClick={onTogglePanel}>
        コメント{' '}
        {commentCount > 0 && (
          <span id="comment-count" className={styles.commentCount}>
            {commentCount}
          </span>
        )}
      </button>
      {onDictSync && (
        <button
          data-testid="dict-fetch-btn"
          className="btn"
          onClick={onDictSync}
          disabled={isDictSyncing}
        >
          {isDictSyncing ? '辞書更新中...' : '辞書更新'}
        </button>
      )}
      <button className="btn primary" id="btn-copy" onClick={onCopyReview}>
        レビューをコピー
      </button>
      <button
        className="btn icon"
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
      </button>
      <span className="sep" />
      <button
        id="btn-checkpoint"
        className="btn"
        data-has-checkpoint={String(checkpointSet)}
        title="チェックポイントを設定"
        onClick={onCheckpoint}
      >
        📍
      </button>
      <button
        id="btn-diff"
        className="btn"
        data-active={String(diffMode)}
        title="差分チェックモード切替"
        onClick={onToggleDiff}
      >
        ± 差分チェック
      </button>
      <button
        className="btn icon"
        id="btn-theme"
        title="テーマ切替"
        onClick={onToggleTheme}
      >
        ◐
      </button>
    </header>
  );
}
