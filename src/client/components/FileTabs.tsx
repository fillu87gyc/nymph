import type { FileEntry } from '../types.ts';

interface FileTabsProps {
  files: FileEntry[];
  activeFile: string | null;
  onSwitch: (path: string) => void;
  onClose: (path: string) => void;
}

export function FileTabs({ files, activeFile, onSwitch, onClose }: FileTabsProps) {
  if (files.length === 0) return null;

  return (
    <div id="file-tabs">
      {files.map((f) => {
        const isActive = f.path === activeFile;
        return (
          <button
            key={f.path}
            className={`tab${isActive ? ' active' : ''}`}
            onClick={() => !isActive && onSwitch(f.path)}
          >
            {isActive && <span className="watch-dot" id="watch-dot" />}
            {f.name}
            {f.path !== '__dropped__' && (
              <span
                className="tab-close"
                role="button"
                aria-label={`${f.name}を閉じる`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(f.path);
                }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
