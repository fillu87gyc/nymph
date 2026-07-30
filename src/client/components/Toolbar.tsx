import type { MarginCollapse } from '../lib/contentWidth.ts';
import type { BookmarkEntry, RecentEntry } from '../types.ts';
import { OpenFileButton } from './OpenFileButton.tsx';
import { OverflowMenu } from './OverflowMenu.tsx';
import { RecentMenu } from './RecentMenu.tsx';
import { SettingsPopover } from './SettingsPopover.tsx';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  version: string;
  updateTime: string;
  /** Open（未解決）コメント件数。全件数ではない（crit の思想）。 */
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
  tocOpen: boolean;
  onToggleToc: () => void;
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
  marginCollapse: MarginCollapse;
  onToggleMargin: (side: 'left' | 'right') => void;
  manualWidth: number | null;
  onResetWidth: () => void;
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
  tocOpen,
  onToggleToc,
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
  marginCollapse,
  onToggleMargin,
  manualWidth,
  onResetWidth,
}: ToolbarProps) {
  // 接続状態＋最終更新時刻はドット1個に統合し、詳細は title のツールチップに出す
  const connectionTitle = isConnected
    ? updateTime
      ? `接続中 ・ ${updateTime}`
      : '接続中'
    : '接続が切れています';

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
      <span className="spacer" />
      <span
        id="connection-status"
        className={styles.connectionStatus}
        data-connected={String(isConnected)}
        title={connectionTitle}
      >
        <span
          className={styles.connectionDot}
          data-testid="connection-dot"
          data-connected={String(isConnected)}
        />
      </span>
      <button
        className="btn"
        id="btn-toc"
        data-testid="toc-toggle"
        data-active={String(tocOpen)}
        title="目次を表示"
        disabled={diffMode}
        onClick={onToggleToc}
      >
        目次
      </button>
      <button className="btn" id="btn-comments" onClick={onTogglePanel}>
        コメント{' '}
        {commentCount > 0 && (
          <span id="comment-count" className={styles.commentCount}>
            {commentCount}
          </span>
        )}
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
      <button className="btn primary" id="btn-copy" onClick={onCopyReview}>
        レビューをコピー
      </button>
      <SettingsPopover
        onToggleTheme={onToggleTheme}
        contentFontId={contentFontId}
        onChangeContentFont={onChangeContentFont}
        marginCollapse={marginCollapse}
        onToggleMargin={onToggleMargin}
        manualWidth={manualWidth}
        onResetWidth={onResetWidth}
      />
      <OverflowMenu
        onPickDir={onPickDir}
        canCopyPath={canCopyPath}
        onCopyPath={onCopyPath}
        bookmarkActive={bookmarkActive}
        canBookmark={canBookmark}
        onToggleBookmark={onToggleBookmark}
        checkpointSet={checkpointSet}
        onCheckpoint={onCheckpoint}
        onDictSync={onDictSync}
        isDictSyncing={isDictSyncing}
        onClearAll={onClearAll}
      />
    </header>
  );
}
