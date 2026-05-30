import type { FileEntry } from '../types.ts';

interface FileTabsProps {
  files: FileEntry[];
  activeFile: string | null;
  onSwitch: (path: string) => void;
}

export function FileTabs({ files, activeFile, onSwitch }: FileTabsProps) {
  if (files.length === 0) return null;

  if (files.length === 1) {
    return (
      <div id="file-tabs">
        <span className="tab active">
          <span className="watch-dot" id="watch-dot" />
          {files[0].name}
        </span>
      </div>
    );
  }

  return (
    <div id="file-tabs">
      {files.map((f) => (
        <button
          key={f.path}
          className={`tab${f.path === activeFile ? ' active' : ''}`}
          onClick={() => f.path !== activeFile && onSwitch(f.path)}
        >
          {f.path === activeFile && (
            <span className="watch-dot" id="watch-dot" />
          )}
          {f.name}
        </button>
      ))}
    </div>
  );
}
