import { useState } from 'react';
import type { TreeNode } from '../types.ts';
import styles from './FileTree.module.css';

interface FileTreeProps {
  rootName: string;
  tree: TreeNode[];
  activeFile: string | null;
  onOpenFile: (path: string) => void;
}

interface TreeRowsProps {
  nodes: TreeNode[];
  depth: number;
  activeFile: string | null;
  collapsed: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
}

function TreeRows({
  nodes,
  depth,
  activeFile,
  collapsed,
  onToggleDir,
  onOpenFile,
}: TreeRowsProps) {
  return (
    <>
      {nodes.map((node) =>
        node.type === 'dir' ? (
          <div key={node.path}>
            <button
              type="button"
              className={styles.row}
              data-testid="tree-dir"
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => onToggleDir(node.path)}
            >
              <span className={styles.chevron}>
                {collapsed.has(node.path) ? '▸' : '▾'}
              </span>
              {node.name}
            </button>
            {!collapsed.has(node.path) && (
              <TreeRows
                nodes={node.children ?? []}
                depth={depth + 1}
                activeFile={activeFile}
                collapsed={collapsed}
                onToggleDir={onToggleDir}
                onOpenFile={onOpenFile}
              />
            )}
          </div>
        ) : (
          <button
            type="button"
            key={node.path}
            className={styles.row}
            data-testid="tree-file"
            data-active={String(node.path === activeFile)}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => onOpenFile(node.path)}
          >
            <span className={styles.fileIcon}>▤</span>
            {node.name}
          </button>
        ),
      )}
    </>
  );
}

export function FileTree({
  rootName,
  tree,
  activeFile,
  onOpenFile,
}: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleDir(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <aside id="file-tree" className={styles.sidebar}>
      <div className={styles.header} data-testid="tree-root-name">
        {rootName}
      </div>
      {tree.length === 0 && (
        <div className={styles.empty}>.md ファイルがありません</div>
      )}
      <TreeRows
        nodes={tree}
        depth={0}
        activeFile={activeFile}
        collapsed={collapsed}
        onToggleDir={toggleDir}
        onOpenFile={onOpenFile}
      />
    </aside>
  );
}
