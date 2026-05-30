import { useEffect, useRef, useState } from 'react';

interface SelectionPopupProps {
  contentId: string;
  onComment: (ls: number, le: number, ctx: string, selectionOffset: number | null) => void;
}

export function SelectionPopup({ contentId, onComment }: SelectionPopupProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const popupRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ ls: number; le: number; ctx: string; offset: number | null } | null>(null);

  function hide() {
    setVisible(false);
    selectionRef.current = null;
  }

  function show() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { hide(); return; }
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) { hide(); return; }

    const content = document.getElementById(contentId);
    if (!content?.contains(range.commonAncestorContainer)) { hide(); return; }

    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) { hide(); return; }

    const toBlock = (node: Node) =>
      (node.nodeType === 3 ? (node as Text).parentElement : node as Element)?.closest?.('.md-block') as HTMLElement | null;

    const startBlock = toBlock(range.startContainer);
    const endBlock = toBlock(range.endContainer);
    const ls = startBlock ? +startBlock.dataset.ls! : 1;
    const le = endBlock ? +endBlock.dataset.le! : ls;
    const ctx = selectedText.length > 300 ? selectedText.slice(0, 300) + '…' : selectedText;

    let selectionOffset: number | null = null;
    if (startBlock) {
      const walker = document.createTreeWalker(startBlock, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      let acc = 0;
      while ((node = walker.nextNode() as Text | null)) {
        if (node === range.startContainer) {
          const leadingWS = sel.toString().length - sel.toString().trimStart().length;
          selectionOffset = acc + range.startOffset + leadingWS;
          break;
        }
        acc += node.textContent?.length ?? 0;
      }
    }

    selectionRef.current = { ls, le, ctx, offset: selectionOffset };

    // Show temporarily to measure width
    setVisible(true);
    requestAnimationFrame(() => {
      const pw = popupRef.current?.offsetWidth ?? 120;
      let left = rect.left + (rect.width - pw) / 2;
      let top = rect.bottom + 8;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      if (top + 40 > window.innerHeight) top = rect.top - 40;
      setPos({ left, top });
    });
  }

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
  }, [contentId]);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault(); // keep selection alive
  }

  function handleClick() {
    const s = selectionRef.current;
    if (!s) return;
    hide();
    window.getSelection()?.removeAllRanges();
    onComment(s.ls, s.le, s.ctx, s.offset);
  }

  return (
    <div
      ref={popupRef}
      id="selection-popup"
      className={visible ? 'visible' : ''}
      style={visible ? { left: pos.left, top: pos.top } : {}}
    >
      <button id="btn-selection-comment" onMouseDown={handleMouseDown} onClick={handleClick}>
        ＋ コメント
      </button>
    </div>
  );
}
