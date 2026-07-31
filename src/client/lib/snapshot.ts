import type {
  CommentSnapshot,
  DiffLine,
  DiffResponse,
  PendingComment,
} from '../types.ts';
import { isDiffContext } from './comments.ts';

/** スナップショットに含める対象範囲の前後行数。 */
export const SNAPSHOT_CONTEXT_LINES = 5;

/**
 * 行配列から「対象範囲 + 前後 context 行」を切り出す。
 * lineStart / lineEnd は 1 始まり。対象が配列の範囲外なら null。
 */
export function sliceSnapshot(
  lines: string[],
  lineStart: number,
  lineEnd: number,
  context: number = SNAPSHOT_CONTEXT_LINES,
): CommentSnapshot | null {
  if (lineStart < 1 || lineStart > lines.length) return null;
  const end = Math.min(Math.max(lineEnd, lineStart), lines.length);
  return {
    startLine: lineStart,
    before: lines.slice(Math.max(0, lineStart - 1 - context), lineStart - 1),
    target: lines.slice(lineStart - 1, end),
    after: lines.slice(end, end + context),
  };
}

/**
 * diff の行リストから片側（old / new）のファイル内容を行順に復元する。
 * 欠番（そのサイドに存在しない行番号）は空行で埋める。
 */
export function diffSideLines(
  lines: DiffLine[],
  side: 'old' | 'new',
): string[] {
  const seq: string[] = [];
  for (const l of lines) {
    const no = side === 'old' ? l.o : l.n;
    if (no != null) seq[no - 1] = l.content;
  }
  return Array.from(seq, (l) => l ?? '');
}

export interface SnapshotRow {
  /** 元ファイル上の行番号（1 始まり） */
  n: number;
  text: string;
  /** コメント対象の行なら true */
  isTarget: boolean;
}

/** スナップショットを行番号付きの表示用の行リストへ展開する。 */
export function snapshotRows(snapshot: CommentSnapshot): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  let n = snapshot.startLine - snapshot.before.length;
  for (const text of snapshot.before)
    rows.push({ n: n++, text, isTarget: false });
  for (const text of snapshot.target)
    rows.push({ n: n++, text, isTarget: true });
  for (const text of snapshot.after)
    rows.push({ n: n++, text, isTarget: false });
  return rows;
}

/**
 * これから保存するコメントの「もとの文章」スナップショットを作る。
 *
 * 通常のコメントは本文（source）から、差分への指摘は行番号が diff 基準の
 * ため diff の該当サイドから切り出す。切り出せない場合（本文が空・diff 未取得
 * など）は null を返し、コメントには snapshot を付けない。
 */
export function buildCommentSnapshot(
  pending: PendingComment,
  source: string,
  diffData: DiffResponse | null,
): CommentSnapshot | null {
  if (pending.block_type === 'diff') {
    if (!diffData || !isDiffContext(pending.context)) return null;
    const ctx = pending.context;
    const line = ctx.side === 'old' ? ctx.oldLine : ctx.newLine;
    if (line == null) return null;
    return sliceSnapshot(diffSideLines(diffData.lines, ctx.side), line, line);
  }
  if (!source) return null;
  return sliceSnapshot(source.split('\n'), pending.lineStart, pending.lineEnd);
}
