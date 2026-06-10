import { useEffect, useMemo, useState } from 'react';
import { renderCharDiff } from '../lib/charDiff.tsx';
import { isDiffContext } from '../lib/comments.ts';
import { buildSplitRows, type SplitRow } from '../lib/diffRows.ts';
import type { Comment, DiffContext, DiffLine, DiffResponse } from '../types.ts';
import styles from './DiffView.module.css';

// hunk スナップショットに含める前後の行数
const HUNK_CONTEXT = 2;

export interface DiffHighlightTarget {
  side: 'old' | 'new';
  line: number;
  // 同じ行への連続ジャンプでも flash を再トリガーするためのバージョン値
  v: number;
}

type AddCommentCb = (
  lineStart: number,
  lineEnd: number,
  displayCtx: string,
  blockType: string,
  context: Comment['context'],
  selectionOffset: number | null,
) => void;

interface DiffViewProps {
  diffData: DiffResponse | null;
  comments: Comment[];
  highlightTarget: DiffHighlightTarget | null;
  onAddComment: AddCommentCb;
  onClickCommentAnchor: (c: Comment, x: number, y: number) => void;
}

// 片側（old/new）のセルが指すコメントを引くためのキー
function cellKey(side: 'old' | 'new', line: number): string {
  return `${side}:${line}`;
}

export function DiffView({
  diffData,
  comments,
  highlightTarget,
  onAddComment,
  onClickCommentAnchor,
}: DiffViewProps) {
  const rows = useMemo(() => buildSplitRows(diffData?.lines ?? []), [diffData]);

  // 各サイドのファイル内容（行順）。hunk スナップショットの切り出しに使う。
  const { oldSeq, newSeq } = useMemo(() => {
    const oldSeq: string[] = [];
    const newSeq: string[] = [];
    for (const l of diffData?.lines ?? []) {
      if (l.o != null) oldSeq[l.o - 1] = l.content;
      if (l.n != null) newSeq[l.n - 1] = l.content;
    }
    return { oldSeq, newSeq };
  }, [diffData]);

  // 「差分への指摘」コメントをセル位置（side + 行番号）で引けるようにする。
  // 行内容まで一致するものだけ紐づけ、古い diff 由来のコメントは無視する。
  const commentMap = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.block_type !== 'diff' || !isDiffContext(c.context)) continue;
      const ctx = c.context;
      const line = ctx.side === 'old' ? ctx.oldLine : ctx.newLine;
      if (line == null) continue;
      const content = ctx.side === 'old' ? oldSeq[line - 1] : newSeq[line - 1];
      if (content !== ctx.line) continue;
      const key = cellKey(ctx.side, line);
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [comments, oldSeq, newSeq]);

  // コメントクリック時のジャンプ先 flash
  const [flashKey, setFlashKey] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightTarget) return;
    const key = cellKey(highlightTarget.side, highlightTarget.line);
    const el = document.querySelector(`[data-diff-cell="${key}"]`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    setFlashKey(key);
    const timer = setTimeout(
      () => setFlashKey((prev) => (prev === key ? null : prev)),
      1400,
    );
    return () => clearTimeout(timer);
  }, [highlightTarget]);

  function handleAddComment(side: 'old' | 'new', line: DiffLine) {
    const lineNo = side === 'old' ? line.o : line.n;
    if (lineNo == null) return;
    const seq = side === 'old' ? oldSeq : newSeq;
    const hunk = seq.slice(
      Math.max(0, lineNo - 1 - HUNK_CONTEXT),
      lineNo + HUNK_CONTEXT,
    );
    const ctx: DiffContext = {
      side,
      oldLine: line.o,
      newLine: line.n,
      line: line.content,
      hunk,
    };
    const anchor = line.n ?? line.o ?? 1;
    onAddComment(anchor, anchor, line.content, 'diff', ctx, null);
  }

  function renderCell(row: SplitRow, side: 'old' | 'new') {
    const line = side === 'old' ? row.left : row.right;
    if (!line) {
      return (
        <>
          <span className={styles.lineNum} />
          <span
            className={`${styles.cell} ${styles.cellEmpty}`}
            data-testid={`diff-cell-${side}`}
            data-line-type="empty"
          />
        </>
      );
    }

    const lineNo = side === 'old' ? line.o : line.n;
    const changed =
      side === 'old' ? line.type === 'delete' : line.type === 'insert';
    const key = lineNo != null ? cellKey(side, lineNo) : null;
    const cellComments = key ? (commentMap.get(key) ?? []) : [];

    let body: React.ReactNode = line.content;
    if (changed && row.pair && row.left && row.right) {
      body = renderCharDiff(
        row.left.content,
        row.right.content,
        side === 'old' ? 'del' : 'ins',
        { del: styles.charDel, ins: styles.charIns },
      );
    } else if (changed) {
      body = (
        <mark
          className={side === 'old' ? styles.charDel : styles.charIns}
          data-testid={side === 'old' ? 'diff-char-del' : 'diff-char-ins'}
        >
          {line.content || ' '}
        </mark>
      );
    }

    const cellClass = [
      styles.cell,
      changed ? (side === 'old' ? styles.cellDel : styles.cellIns) : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <>
        <span className={styles.lineNum} data-testid={`diff-num-${side}`}>
          {changed && (
            <span className={styles.sign}>{side === 'old' ? '−' : '+'}</span>
          )}
          {lineNo}
        </span>
        <span
          className={cellClass}
          data-testid={`diff-cell-${side}`}
          data-line-type={changed ? line.type : 'equal'}
          data-diff-cell={key ?? undefined}
          data-highlighted={String(flashKey != null && flashKey === key)}
          data-has-comment={String(cellComments.length > 0)}
        >
          <span className={styles.cellText}>{body}</span>
          <span className={styles.cellTools}>
            {cellComments.length > 0 && (
              <button
                type="button"
                className={styles.anchorBtn}
                data-testid="diff-comment-anchor"
                title="コメントを表示"
                onClick={(e) =>
                  onClickCommentAnchor(cellComments[0], e.clientX, e.clientY)
                }
              >
                💬
              </button>
            )}
            <button
              type="button"
              className={styles.addBtn}
              data-testid="diff-comment-btn"
              title="差分への指摘を追加"
              aria-label="差分への指摘を追加"
              onClick={() => handleAddComment(side, line)}
            >
              ＋
            </button>
          </span>
        </span>
      </>
    );
  }

  if (!diffData || !diffData.hasCheckpoint) {
    return (
      <div className={styles.view} data-testid="diff-view">
        <div className={styles.empty} data-testid="diff-empty">
          チェックポイントが設定されていません。📍
          でチェックポイントを設定すると、その時点からの差分をここで確認できます。
        </div>
      </div>
    );
  }

  return (
    <div className={styles.view} data-testid="diff-view">
      <div className={styles.header}>
        <span className={styles.headerCol}>チェックポイント</span>
        <span className={styles.headerCol}>現在</span>
      </div>
      <div className={styles.table}>
        {rows.map((row, i) => (
          // 行は diff 計算のたびに丸ごと再生成され安定 id を持たないため index キーで足りる
          // biome-ignore lint/suspicious/noArrayIndexKey: rows は毎回再生成され安定 id を持たない
          <div key={i} className={styles.row} data-testid="diff-row">
            {renderCell(row, 'old')}
            {renderCell(row, 'new')}
          </div>
        ))}
      </div>
    </div>
  );
}
