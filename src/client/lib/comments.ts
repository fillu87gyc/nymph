import type {
  CodeContext,
  Comment,
  CommentFilter,
  DiffContext,
  TableContext,
} from '../types.ts';

export function isDiffContext(ctx: Comment['context']): ctx is DiffContext {
  return typeof ctx === 'object' && ctx !== null && 'hunk' in ctx;
}

export function ctxDisplay(c: Comment): string {
  const ctx = c.context;
  if (!ctx) return '';
  if (typeof ctx === 'string') return ctx.split('\n')[0];
  if (isDiffContext(ctx)) return ctx.line;
  if ('headers' in ctx) return (ctx as TableContext).headers.join(' | ');
  if ('code' in ctx) return (ctx as CodeContext).code.split('\n')[0];
  return '';
}

// アクティブファイルを明示した /comments の SWR キー・POST URL を組み立てる。
// __dropped__ はファイル実体が無くコメントを保存できないため、あえて file
// パラメータを付けない（サーバー側で 4xx を返す設計に対応させる）。
export function commentsKey(activeFile: string | null): string {
  return activeFile && activeFile !== '__dropped__'
    ? `/comments?file=${encodeURIComponent(activeFile)}`
    : '/comments';
}

// useFiles.ts や App.tsx から `/comments` および `/comments?file=...` の
// どちらのキーも一括で再検証できるようにするための SWR key マッチャー。
export function isCommentsKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    (key === '/comments' || key.startsWith('/comments?'))
  );
}

// コメントパネルの All / Open / Resolved フィルタ判定。
// resolved が未定義のコメント（既存データ含む）は open 扱いになる。
export function matchesCommentFilter(
  c: Comment,
  filter: CommentFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return !c.resolved;
  return c.resolved === true;
}
