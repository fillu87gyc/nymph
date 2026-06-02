import { useCallback, useRef, useState } from 'react';
import { ctxDisplay } from '../lib/comments.ts';
import type { Comment } from '../types.ts';
import styles from './CommentsPanel.module.css';

const PANEL_DEFAULT_H = 210;
const PANEL_MIN_H = 80;

interface CommentsPanelProps {
  open: boolean;
  comments: Comment[];
  orphanedIds?: Set<number>;
  onScrollToComment: (c: Comment) => void;
  onEdit: (c: Comment) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

export function CommentsPanel({
  open,
  comments,
  orphanedIds,
  onScrollToComment,
  onEdit,
  onDelete,
  onClose,
}: CommentsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(
    () =>
      parseInt(localStorage.getItem('nymph-panel-height') || '0', 10) ||
      PANEL_DEFAULT_H,
  );

  const startDrag = useCallback((e: React.MouseEvent) => {
    const startY = e.clientY;
    const startH = panelRef.current?.offsetHeight ?? PANEL_DEFAULT_H;

    function onDrag(ev: MouseEvent) {
      const maxH = Math.floor(window.innerHeight * 0.8);
      const h = Math.max(
        PANEL_MIN_H,
        Math.min(maxH, startH + (startY - ev.clientY)),
      );
      setHeight(h);
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
          <li id="no-comments" className={styles.empty}>
            コメントはまだありません。ブロックにカーソルを合わせて ＋
            をクリック。
          </li>
        ) : (
          comments.map((c) => {
            const range = c.ls === c.le ? `L${c.ls}` : `L${c.ls}–${c.le}`;
            const isOrphaned = orphanedIds?.has(c.id) ?? false;
            return (
              <li
                key={c.id}
                className={styles.item}
                data-testid="comment-item"
                data-orphaned={String(isOrphaned)}
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
                    {ctxDisplay(c)}
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.editBtn}
                    data-testid="c-edit"
                    title="編集"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(c);
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
