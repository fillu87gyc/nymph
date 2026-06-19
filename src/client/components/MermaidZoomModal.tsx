import { useEffect, useRef, useState } from 'react';
import styles from './MermaidZoomModal.module.css';

interface MermaidZoomModalProps {
  open: boolean;
  html: string | null;
  onClose: () => void;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 6;
const ZOOM_STEP = 1.1;

export function MermaidZoomModal({
  open,
  html,
  onClose,
}: MermaidZoomModalProps) {
  const [scale, setScale] = useState(1);
  const areaRef = useRef<HTMLDivElement | null>(null);

  // 開くたびに「拡大も縮小もしていない」原寸表示に戻す
  useEffect(() => {
    if (open) setScale(1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area || !open) return;
    // ブラウザのページズームと競合させないため、React の onWheel（passive）
    // ではなく addEventListener({ passive: false }) で preventDefault する。
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale((s) =>
        Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, s * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)),
        ),
      );
    }
    area.addEventListener('wheel', handleWheel, { passive: false });
    return () => area.removeEventListener('wheel', handleWheel);
  }, [open]);

  if (!open || html === null) return null;

  return (
    <div
      id="mermaid-zoom-modal"
      className={styles.modal}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div id="mermaid-zoom-box" className={styles.box}>
        <div className={styles.head}>
          <span className={styles.title}>Mermaid Diagram</span>
          <span className={styles.hint}>Ctrl + スクロールで拡大・縮小</span>
          <button
            type="button"
            className="btn icon"
            id="btn-close-mermaid-zoom"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className={styles.area} id="mermaid-zoom-area" ref={areaRef}>
          <div
            id="mermaid-zoom-scale"
            className={styles.scaleWrap}
            style={{ transform: `scale(${scale})` }}
            // 既にレンダリング済みの mermaid SVG（mermaid 自身が DOM に書き込んだもの）
            // をそのまま拡大表示する。元データは parseBlocks で sanitize 済みの
            // Markdown から mermaid が生成したものなので再サニタイズ不要。
            // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid が描画した SVG をそのまま複製
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}
