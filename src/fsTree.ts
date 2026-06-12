import { type Dirent, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ディレクトリモードのサイドバーに出す .md ツリー。
 * 隠しディレクトリ・node_modules・symlink dir は辿らず、
 * .md を 1 つも含まないディレクトリは結果から刈り取る。
 */

export interface TreeNode {
  type: 'dir' | 'file';
  name: string;
  path: string;
  children?: TreeNode[];
}

export function scanMdTree(root: string): TreeNode[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs: TreeNode[] = [];
  const files: TreeNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const children = scanMdTree(path);
      if (children.length > 0) {
        dirs.push({ type: 'dir', name: entry.name, path, children });
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push({ type: 'file', name: entry.name, path });
    }
  }

  const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name);
  return [...dirs.sort(byName), ...files.sort(byName)];
}
