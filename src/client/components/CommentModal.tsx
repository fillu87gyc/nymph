import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useOutsideDismiss } from '../hooks/useDismiss.ts';
import type { Comment, PendingComment } from '../types.ts';
import styles from './CommentModal.module.css';

export interface CommentModalAnchor {
  x: number;
  y: number;
}

interface CommentModalProps {
  /** 開くたびに増える通し番号。閉じずに開き直したことを検知するために使う。 */
  openSeq: number;
  pending: PendingComment;
  editingId: Comment['id'] | null;
  displayCtx: string;
  initialText: string;
  anchor: CommentModalAnchor | null;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

const BOX_WIDTH = 340;
const MARGIN = 12;
const ANCHOR_OFFSET_Y = 10;

/**
 * コメントの追加・編集モーダル。
 *
 * 以前は open / pending の変化を Effect で見張って textarea の中身とドラッグ位置を
 * 初期化していた。これは公式が挙げる「prop が変わったら state をリセットする」
 * アンチパターンで、リセット前の値が 1 コミットぶん描画されてしまう。
 * 今は開いている間だけマウントされるので初期値は useState で足り、
 * 「閉じずに別のコメントで開き直した」ケースだけ公式の
 * 「レンダー中に state を調整する」で openSeq を見て詰め直す。
 */
export function CommentModal({
  openSeq,
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
  const [text, setText] = useState(initialText);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // 閉じずに別のコメントで開き直したら、前のコメントの入力とドラッグ位置を捨てる。
  const [renderedSeq, setRenderedSeq] = useState(openSeq);
  if (renderedSeq !== openSeq) {
    setRenderedSeq(openSeq);
    setText(initialText);
    setDragOffset({ x: 0, y: 0 });
  }

  // 開くたびに入力へフォーカスする（宣言的な API が無い DOM 操作なので Effect が正しい）
  useEffect(() => {
    taRef.current?.focus();
  }, [openSeq]);

  // 入力中のテキストがある場合は外側クリックで破棄しない
  // （Escape やキャンセルボタンなど明示操作は従来どおり閉じる）。
  useOutsideDismiss(boxRef, onClose, {
    ignore: () => Boolean(text.trim()),
  });

  // 実際の高さを測ってからクランプする（textarea や ctx の長さで高さが変わるため）
  useLayoutEffect(() => {
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
  }, [anchor, dragOffset]);

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
    const trimmed = text.trim();
    if (trimmed) onSubmit(trimmed);
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
        value={text}
        onChange={(e) => setText(e.target.value)}
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
