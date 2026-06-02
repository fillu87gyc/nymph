import { useEffect, useRef } from 'react';
import type { PendingComment } from '../types.ts';
import styles from './CommentModal.module.css';

interface CommentModalProps {
  open: boolean;
  pending: PendingComment | null;
  editingId: number | null;
  displayCtx: string;
  initialText: string;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

export function CommentModal({
  open,
  pending,
  editingId,
  displayCtx,
  initialText,
  onSubmit,
  onClose,
}: CommentModalProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && taRef.current) {
      taRef.current.value = initialText;
      taRef.current.focus();
    }
  }, [open, initialText]);

  if (!open || !pending) return null;

  const lineLabel =
    pending.ls === pending.le
      ? `L${pending.ls}`
      : `L${pending.ls}–${pending.le}`;
  const short = displayCtx.length <= 20 ? `「${displayCtx}」` : null;
  const headText =
    editingId !== null
      ? `${lineLabel} のコメントを編集`
      : short
        ? `${short} にコメント追加`
        : `${lineLabel} にコメント追加`;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') onClose();
  }

  function handleSubmit() {
    const text = taRef.current?.value.trim() ?? '';
    if (text) onSubmit(text);
  }

  return (
    <div id="comment-modal" className={styles.modal}>
      <div id="modal-backdrop" className={styles.backdrop} onClick={onClose} />
      <div id="modal-box" className={styles.box}>
        <div className={styles.head} id="modal-line">
          {headText}
        </div>
        <div className={styles.ctx} id="modal-ctx">
          {displayCtx}
        </div>
        <textarea
          ref={taRef}
          id="comment-ta"
          className={styles.textarea}
          placeholder="コメントを入力… (Cmd+Enter で追加)"
          rows={4}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.foot}>
          <button
            type="button"
            className="btn"
            id="btn-cancel"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="btn primary"
            id="btn-submit"
            onClick={handleSubmit}
          >
            {editingId !== null ? '更新' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
