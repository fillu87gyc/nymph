import { useCallback, useRef, useState } from 'react';
import { ctxDisplay } from '../lib/comments.ts';
import { scrollToLine } from '../lib/markdown.ts';
import type { Comment } from '../types.ts';

const PANEL_DEFAULT_H = 210;
const PANEL_MIN_H = 80;

interface CommentsPanelProps {
  open: boolean;
  comments: Comment[];
  contentRef: React.RefObject<HTMLDivElement | null>;
  onEdit: (c: Comment) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

export function CommentsPanel({
  open,
  comments,
  contentRef,
  onEdit,
  onDelete,
  onClose,
}: CommentsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(PANEL_DEFAULT_H);

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

  function handleItemClick(c: Comment) {
    if (contentRef.current) scrollToLine(contentRef.current, c);
  }

  const savedH =
    parseInt(localStorage.getItem('nymph-panel-height') || '0', 10) ||
    PANEL_DEFAULT_H;
  const panelStyle = open
    ? { height: `${height || savedH}px` }
    : { height: '0' };

  return (
    <div
      id="comments-panel"
      ref={panelRef}
      className={open ? 'open' : ''}
      style={panelStyle}
    >
      <div
        className="panel-resize-handle"
        id="panel-resize-handle"
        onMouseDown={startDrag}
      />
      <div className="cpanel-head">
        <span className="cpanel-title">レビューコメント</span>
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
      <ul id="comments-list">
        {comments.length === 0 ? (
          <li id="no-comments">
            コメントはまだありません。ブロックにカーソルを合わせて ＋
            をクリック。
          </li>
        ) : (
          comments.map((c) => {
            const range = c.ls === c.le ? `L${c.ls}` : `L${c.ls}–${c.le}`;
            return (
              <li
                key={c.id}
                className="comment-item"
                onClick={() => handleItemClick(c)}
              >
                <span className="c-line">{range}</span>
                <div className="c-body">
                  <div className="c-text">{c.text}</div>
                  <div className="c-ctx">{ctxDisplay(c)}</div>
                </div>
                <div className="c-actions">
                  <button
                    type="button"
                    className="c-edit"
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
                    className="c-del"
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
