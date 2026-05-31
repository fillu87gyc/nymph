import type { FileEntry } from '../types.ts';
import { FileTabs } from './FileTabs.tsx';

interface ToolbarProps {
  updateTime: string;
  commentCount: number;
  diffMode: boolean;
  checkpointSet: boolean;
  files: FileEntry[];
  activeFile: string | null;
  onTogglePanel: () => void;
  onCopyReview: () => void;
  onClearAll: () => void;
  onCheckpoint: () => void;
  onToggleDiff: () => void;
  onToggleTheme: () => void;
  onSwitchFile: (path: string) => void;
  onCloseFile: (path: string) => void;
}

export function Toolbar({
  updateTime,
  commentCount,
  diffMode,
  checkpointSet,
  files,
  activeFile,
  onTogglePanel,
  onCopyReview,
  onClearAll,
  onCheckpoint,
  onToggleDiff,
  onToggleTheme,
  onSwitchFile,
  onCloseFile,
}: ToolbarProps) {
  return (
    <header id="toolbar">
      <span className="brand">nymph</span>
      {updateTime && (
        <span className="update-time" id="update-time">
          {updateTime}
        </span>
      )}
      <span className="sep" />
      <FileTabs
        files={files}
        activeFile={activeFile}
        onSwitch={onSwitchFile}
        onClose={onCloseFile}
      />
      <span className="spacer" />
      <button className="btn" id="btn-comments" onClick={onTogglePanel}>
        コメント{' '}
        {commentCount > 0 && (
          <span id="comment-count" className="visible">
            {commentCount}
          </span>
        )}
      </button>
      <button className="btn primary" id="btn-copy" onClick={onCopyReview}>
        レビューをコピー
      </button>
      <button
        className="btn icon"
        id="btn-clear-all"
        title="コメントをすべて削除"
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
        className={`btn${checkpointSet ? ' has-checkpoint' : ''}`}
        title="チェックポイントを設定"
        onClick={onCheckpoint}
      >
        📍
      </button>
      <button
        id="btn-diff"
        className={`btn${diffMode ? ' active' : ''}`}
        title="diff表示切替"
        onClick={onToggleDiff}
      >
        ± diff
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
