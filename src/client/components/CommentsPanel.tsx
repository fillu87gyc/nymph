import { useCallback, useRef, useState } from 'react';
import {
  ctxDisplay,
  isDiffContext,
  matchesCommentFilter,
} from '../lib/comments.ts';
import type { Comment, CommentFilter } from '../types.ts';
import styles from './CommentsPanel.module.css';

// 差分への指摘は新旧どちら側の行かが分かる行表示にする（例: 新L7 / 旧L5）
function lineRef(c: Comment): string {
  if (c.block_type === 'diff' && isDiffContext(c.context)) {
    const ctx = c.context;
    return ctx.side === 'old' ? `旧L${ctx.oldLine}` : `新L${ctx.newLine}`;
  }
  return c.lineStart === c.lineEnd
    ? `L${c.lineStart}`
    : `L${c.lineStart}–${c.lineEnd}`;
}

const PANEL_DEFAULT_H = 210;
const PANEL_MIN_H = 80;

const FILTERS: { id: CommentFilter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'open', label: '未解決' },
  { id: 'resolved', label: '解決済み' },
];

interface CommentsPanelProps {
  open: boolean;
  comments: Comment[];
  orphanedIds?: Set<Comment['id']>;
  onScrollToComment: (c: Comment) => void;
  onEdit: (c: Comment, x: number, y: number) => void;
  onDelete: (id: Comment['id']) => void;
  onToggleResolved: (id: Comment['id']) => void;
  onClose: () => void;
}

export function CommentsPanel({
  open,
  comments,
  orphanedIds,
  onScrollToComment,
  onEdit,
  onDelete,
  onToggleResolved,
  onClose,
}: CommentsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(
    () =>
      parseInt(localStorage.getItem('nymph-panel-height') || '0', 10) ||
      PANEL_DEFAULT_H,
  );
  // フィルタ選択はセッション内のみ（localStorage に永続化しない）。
  const [filter, setFilter] = useState<CommentFilter>('all');

  const startDrag = useCallback((e: React.MouseEvent) => {
    const startY = e.clientY;
    const startH = panelRef.current?.offsetHeight ?? PANEL_DEFAULT_H;

    function onDrag(ev: MouseEvent) {
      const maxH = Math.floor(window.innerHeight * 0.8);
      const newHeight = Math.max(
        PANEL_MIN_H,
        Math.min(maxH, startH + (startY - ev.clientY)),
      );
      setHeight(newHeight);
    }
    function stopDrag() {
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', stopDrag);
      if (panelRef.current) {
        localStorage.setItem(
          'nymph-panel-height',
          String(panelRef.current.offsetHeight),
        );
      }
    }
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  }, []);

  const panelStyle = open ? { height: `${height}px` } : { height: '0' };
  const visibleComments = comments.filter((c) =>
    matchesCommentFilter(c, filter),
  );

  return (
    <div
      id="comments-panel"
      ref={panelRef}
      className={styles.panel}
      data-open={String(open)}
      style={panelStyle}
    >
      <div
        className={styles.resizeHandle}
        id="panel-resize-handle"
        onMouseDown={startDrag}
      />
      <div className={styles.head}>
        <span className={styles.title}>レビューコメント</span>
        <div className={styles.filterGroup} data-testid="comment-filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={styles.filterBtn}
              data-testid={`filter-${f.id}`}
              data-active={String(filter === f.id)}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button
          type="button"
          className="btn icon"
          id="btn-close-panel"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <ul id="comments-list" className={styles.list}>
        {comments.length === 0 ? (
          <li
            id="no-comments"
            data-testid="no-comments"
            className={styles.empty}
          >
            コメントはまだありません。ブロックにカーソルを合わせて ＋
            をクリック。
          </li>
        ) : visibleComments.length === 0 ? (
          <li
            id="no-comments"
            data-testid="no-comments"
            className={styles.empty}
          >
            該当するコメントはありません。
          </li>
        ) : (
          visibleComments.map((c) => {
            const range = lineRef(c);
            const isOrphaned = orphanedIds?.has(c.id) ?? false;
            const isResolved = c.resolved === true;
            return (
              <li
                key={c.id}
                className={styles.item}
                data-testid="comment-item"
                data-orphaned={String(isOrphaned)}
                data-resolved={String(isResolved)}
                onClick={() => onScrollToComment(c)}
              >
                <span className={styles.lineRef}>{range}</span>
                <div className={styles.body}>
                  <div className={styles.text} data-testid="c-text">
                    {c.text}
                  </div>
                  <div className={styles.ctx} data-testid="c-ctx">
                    {isOrphaned && (
                      <span
                        className={styles.deletedBadge}
                        data-testid="c-deleted"
                      >
                        削除済み
                      </span>
                    )}
                    {c.block_type === 'diff' && (
                      <span
                        className={styles.diffBadge}
                        data-testid="c-diff-badge"
                      >
                        差分への指摘
                      </span>
                    )}
                    {!!c.round && (
                      <span className={styles.roundBadge} data-testid="c-round">
                        R{c.round}
                      </span>
                    )}
                    {ctxDisplay(c)}
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.resolveBtn}
                    data-testid="c-resolve"
                    data-resolved={String(isResolved)}
                    title={isResolved ? '未解決に戻す' : '解決済みにする'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleResolved(c.id);
                    }}
                  >
                    {isResolved ? '✓' : '○'}
                  </button>
                  <button
                    type="button"
                    className={styles.editBtn}
                    data-testid="c-edit"
                    title="編集"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(c, e.clientX, e.clientY);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={styles.delBtn}
                    data-testid="c-del"
                    title="削除"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
