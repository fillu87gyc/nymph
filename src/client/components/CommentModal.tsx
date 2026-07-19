import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PendingComment } from '../types.ts';
import styles from './CommentModal.module.css';

export interface CommentModalAnchor {
  x: number;
  y: number;
}

interface CommentModalProps {
  open: boolean;
  pending: PendingComment | null;
  editingId: number | null;
  displayCtx: string;
  initialText: string;
  anchor: CommentModalAnchor | null;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

const BOX_WIDTH = 340;
const MARGIN = 12;
const ANCHOR_OFFSET_Y = 10;

export function CommentModal({
  open,
  pending,
  editingId,
  displayCtx,
  initialText,
  anchor,
  onSubmit,
  onClose,
}: CommentModalProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (open && taRef.current) {
      taRef.current.value = initialText;
      taRef.current.focus();
    }
  }, [open, initialText]);

  // 新しく開いたコメントではドラッグ位置をアンカー基準にリセットする
  useEffect(() => {
    if (open) setDragOffset({ x: 0, y: 0 });
  }, [open, pending]);

  // 実際の高さを測ってからクランプする（textarea や ctx の長さで高さが変わるため）
  useLayoutEffect(() => {
    if (!open || !pending) return;
    const el = boxRef.current;
    const w = el?.offsetWidth ?? BOX_WIDTH;
    const h = el?.offsetHeight ?? 0;
    const baseLeft = anchor
      ? anchor.x
      : window.innerWidth - BOX_WIDTH - MARGIN - 18;
    const baseTop = anchor ? anchor.y + ANCHOR_OFFSET_Y : 54;
    setPos({
      left: Math.max(
        MARGIN,
        Math.min(baseLeft + dragOffset.x, window.innerWidth - w - MARGIN),
      ),
      top: Math.max(
        MARGIN,
        Math.min(baseTop + dragOffset.y, window.innerHeight - h - MARGIN),
      ),
    });
  }, [open, pending, anchor, dragOffset]);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (boxRef.current?.contains(e.target as Node)) return;
      // 入力中のテキストがある場合は外側クリックで破棄しない
      // （Escape や キャンセルボタンなど明示操作は従来通り閉じる）。
      if (taRef.current?.value.trim()) return;
      onClose();
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open, onClose]);

  function startDrag(e: React.MouseEvent) {
    dragStartRef.current = {
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y,
    };

    function onDrag(ev: MouseEvent) {
      if (!dragStartRef.current) return;
      setDragOffset({
        x: ev.clientX - dragStartRef.current.x,
        y: ev.clientY - dragStartRef.current.y,
      });
    }
    function stopDrag() {
      dragStartRef.current = null;
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', stopDrag);
    }
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  }

  if (!open || !pending) return null;

  const lineLabel =
    pending.lineStart === pending.lineEnd
      ? `L${pending.lineStart}`
      : `L${pending.lineStart}–${pending.lineEnd}`;
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
    <div
      id="comment-modal"
      ref={boxRef}
      className={styles.box}
      style={{ left: pos.left, top: pos.top, width: BOX_WIDTH }}
    >
      <div className={styles.head} id="modal-line" onMouseDown={startDrag}>
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
        <button type="button" className="btn" id="btn-cancel" onClick={onClose}>
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
  );
}
