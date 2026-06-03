import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './SelectionPopup.module.css';

interface SelectionPopupProps {
  contentRef: React.RefObject<HTMLElement | null>;
  onComment: (
    lineStart: number,
    lineEnd: number,
    ctx: string,
    selectionOffset: number | null,
  ) => void;
}

export function SelectionPopup({ contentRef, onComment }: SelectionPopupProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const popupRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{
    lineStart: number;
    lineEnd: number;
    ctx: string;
    offset: number | null;
  } | null>(null);

  const hide = useCallback(() => {
    setVisible(false);
    selectionRef.current = null;
  }, []);

  const show = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      hide();
      return;
    }
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) {
      hide();
      return;
    }

    if (!contentRef.current?.contains(range.commonAncestorContainer)) {
      hide();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      hide();
      return;
    }

    const toBlock = (node: Node) =>
      (node.nodeType === 3
        ? (node as Text).parentElement
        : (node as Element)
      )?.closest?.('[data-block]') as HTMLElement | null;

    const startBlock = toBlock(range.startContainer);
    const endBlock = toBlock(range.endContainer);
    // 属性欠落時は NaN にして「不正な行番号」を明示する（+'' の 0 だと
    // 1 始まりの行番号と衝突して欠落を握り潰してしまうため Number() を使う）。
    const lineStart = startBlock ? Number(startBlock.dataset.lineStart) : 1;
    const lineEnd = endBlock ? Number(endBlock.dataset.lineEnd) : lineStart;
    const ctx =
      selectedText.length > 300
        ? `${selectedText.slice(0, 300)}…`
        : selectedText;

    let selectionOffset: number | null = null;
    if (startBlock) {
      const walker = document.createTreeWalker(
        startBlock,
        NodeFilter.SHOW_TEXT,
      );
      let node: Text | null;
      let acc = 0;
      while ((node = walker.nextNode() as Text | null)) {
        if (node === range.startContainer) {
          const leadingWS =
            sel.toString().length - sel.toString().trimStart().length;
          selectionOffset = acc + range.startOffset + leadingWS;
          break;
        }
        acc += node.textContent?.length ?? 0;
      }
    }

    selectionRef.current = { lineStart, lineEnd, ctx, offset: selectionOffset };

    setVisible(true);
    requestAnimationFrame(() => {
      const pw = popupRef.current?.offsetWidth ?? 120;
      let left = rect.left + (rect.width - pw) / 2;
      let top = rect.bottom + 8;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      if (top + 40 > window.innerHeight) top = rect.top - 40;
      setPos({ left, top });
    });
  }, [contentRef, hide]);

  useEffect(() => {
    const onMouseUp = () => setTimeout(show, 30);
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) hide();
    };
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('selectionchange', onSelChange);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('selectionchange', onSelChange);
    };
  }, [show, hide]);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault(); // keep selection alive
  }

  function handleClick() {
    const s = selectionRef.current;
    if (!s) return;
    hide();
    window.getSelection()?.removeAllRanges();
    onComment(s.lineStart, s.lineEnd, s.ctx, s.offset);
  }

  if (!visible) return null;

  return (
    <div
      ref={popupRef}
      id="selection-popup"
      className={styles.popup}
      style={{ left: pos.left, top: pos.top }}
    >
      <button
        id="btn-selection-comment"
        className={styles.btn}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        ＋ コメント
      </button>
    </div>
  );
}
