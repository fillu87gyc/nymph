import type {
  BookmarkEntry,
  FileEntry,
  RecentEntry,
  TreeNode,
} from '../types.ts';

export interface QuickOpenItem {
  path: string;
  name: string;
  detail: string;
  type: 'file' | 'dir';
}

function flattenTreeFiles(nodes: TreeNode[], out: QuickOpenItem[]): void {
  for (const node of nodes) {
    if (node.type === 'dir') {
      flattenTreeFiles(node.children ?? [], out);
    } else {
      const slash = node.path.lastIndexOf('/');
      out.push({
        path: node.path,
        name: node.name,
        detail: slash > 0 ? node.path.slice(0, slash) : '',
        type: 'file',
      });
    }
  }
}

/**
 * Ctrl+P パレットの候補。開いているタブ → 最近 → ブックマーク → ツリーの
 * 優先順でマージして path で dedupe し、クエリで部分一致フィルタする。
 */
export function buildQuickOpenItems(
  tabs: FileEntry[],
  recents: RecentEntry[],
  bookmarks: BookmarkEntry[],
  tree: TreeNode[],
  query: string,
): QuickOpenItem[] {
  const candidates: QuickOpenItem[] = [];
  for (const t of tabs) {
    // ドロップ由来の擬似タブは実パスを持たないため開けない
    if (t.path === '__dropped__') continue;
    const slash = t.path.lastIndexOf('/');
    candidates.push({
      path: t.path,
      name: t.name,
      detail: slash > 0 ? t.path.slice(0, slash) : '',
      type: 'file',
    });
  }
  for (const r of recents) {
    candidates.push({
      path: r.path,
      name: r.name,
      detail: r.dir,
      type: 'file',
    });
  }
  for (const b of bookmarks) {
    candidates.push({
      path: b.path,
      name: b.name,
      detail: b.dir,
      type: b.type,
    });
  }
  flattenTreeFiles(tree, candidates);

  const seen = new Set<string>();
  const q = query.trim().toLowerCase();
  const items: QuickOpenItem[] = [];
  for (const c of candidates) {
    if (seen.has(c.path)) continue;
    seen.add(c.path);
    if (
      q &&
      !c.name.toLowerCase().includes(q) &&
      !c.path.toLowerCase().includes(q)
    )
      continue;
    items.push(c);
  }
  return items;
}
