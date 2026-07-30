import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { COMMENT_STATUS_LABEL, ctxDisplay } from '../lib/comments.ts';
import { snapshotRows } from '../lib/snapshot.ts';
import type { Comment, CommentStatus } from '../types.ts';
import styles from './SnapshotBalloon.module.css';

// 吹き出しの幅（px）。画面外へはみ出さないよう位置計算にも使う。
const BALLOON_WIDTH = 460;

interface SnapshotBalloonProps {
  comment: Comment;
  status: CommentStatus;
  /** 吹き出しを指し示す元（ステータスバッジ）の位置 */
  anchorRect: DOMRect;
  onClose: () => void;
}

/**
 * コメント作成時に保存した「もとの文章」（対象行 + 前後 5 行）を吹き出しで
 * 表示する。対象の文章が削除されたコメント（削除済）や、解決して本文から
 * 消えたコメント（解決済）でも、何に対する指摘だったかを辿れるようにする。
 */
export function SnapshotBalloon({
  comment,
  status,
  anchorRect,
  onClose,
}: SnapshotBalloonProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      // バッジ自身のクリックは開閉トグル側に任せる
      if (target?.closest('[data-testid="c-status"]')) return;
      if (target?.closest('[data-testid="snapshot-balloon"]')) return;
      onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [onClose]);

  const rows = comment.snapshot ? snapshotRows(comment.snapshot) : [];
  // コメントパネルは画面下部にあるため、バッジの上側に出す。
  const left = Math.max(
    8,
    Math.min(anchorRect.left - 14, window.innerWidth - BALLOON_WIDTH - 8),
  );
  const bottom = Math.max(8, window.innerHeight - anchorRect.top + 10);

  return createPortal(
    <div
      id="snapshot-balloon"
      data-testid="snapshot-balloon"
      className={styles.balloon}
      style={{ left, bottom, width: BALLOON_WIDTH }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.head}>
        <span className={styles.title}>もとの文章</span>
        <span className={styles.status} data-status={status}>
          {COMMENT_STATUS_LABEL[status]}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="btn icon"
          data-testid="snapshot-close"
          title="閉じる"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {rows.length > 0 ? (
        <ol className={styles.lines} data-testid="snapshot-lines">
          {rows.map((row) => (
            <li
              key={row.n}
              className={styles.line}
              data-line={row.n}
              data-target={String(row.isTarget)}
              data-testid={row.isTarget ? 'snapshot-line-target' : undefined}
            >
              <span className={styles.ln}>{row.n}</span>
              <span className={styles.code}>{row.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.empty} data-testid="snapshot-empty">
          <div>
            このコメントにはスナップショットがありません（この機能より前に作成されたコメント）。
          </div>
          {ctxDisplay(comment) && (
            <div className={styles.fallbackCtx}>{ctxDisplay(comment)}</div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
