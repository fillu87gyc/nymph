import { CONTENT_FONT_OPTIONS } from '../lib/fonts.ts';
import type { BookmarkEntry, RecentEntry } from '../types.ts';
import { OpenDirButton } from './OpenDirButton.tsx';
import { OpenFileButton } from './OpenFileButton.tsx';
import { RecentMenu } from './RecentMenu.tsx';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  version: string;
  updateTime: string;
  commentCount: number;
  diffMode: boolean;
  checkpointSet: boolean;
  isConnected: boolean;
  recentFiles: RecentEntry[];
  recentOpen: boolean;
  bookmarks: BookmarkEntry[];
  bookmarkActive: boolean;
  canBookmark: boolean;
  onToggleBookmark: () => void;
  onToggleRecent: (open: boolean) => void;
  onOpenFile: (path: string) => void;
  onOpenDir: (path: string) => void;
  onPickFile: () => void;
  onPickDir: () => void;
  onTogglePanel: () => void;
  onCopyReview: () => void;
  canCopyPath: boolean;
  onCopyPath: () => void;
  onClearAll: () => void;
  onCheckpoint: () => void;
  onToggleDiff: () => void;
  onToggleTheme: () => void;
  contentFontId: string;
  onChangeContentFont: (id: string) => void;
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
  recentFiles,
  recentOpen,
  bookmarks,
  bookmarkActive,
  canBookmark,
  onToggleBookmark,
  onToggleRecent,
  onOpenFile,
  onOpenDir,
  onPickFile,
  onPickDir,
  onTogglePanel,
  onCopyReview,
  canCopyPath,
  onCopyPath,
  onClearAll,
  onCheckpoint,
  onToggleDiff,
  onToggleTheme,
  contentFontId,
  onChangeContentFont,
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
      <OpenFileButton onPickFile={onPickFile} />
      <OpenDirButton onPickDir={onPickDir} />
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
      </button>
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
      <select
        id="content-font-select"
        data-testid="content-font-select"
        className={styles.fontSelect}
        title="本文フォント"
        value={contentFontId}
        onChange={(e) => onChangeContentFont(e.target.value)}
      >
        {CONTENT_FONT_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
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
