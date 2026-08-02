import { useEffect, useRef, useState } from 'react';
import { useEscapeDismiss } from '../hooks/useDismiss.ts';
import styles from './MermaidZoomModal.module.css';

interface MermaidZoomModalProps {
  html: string;
  onClose: () => void;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 6;
const ZOOM_STEP = 1.1;

/**
 * mermaid 図の拡大表示。
 *
 * 開閉のたびに拡大率を原寸へ戻す必要があるが、以前は open prop の変化を
 * Effect で拾って setScale(1) していた。これは公式が挙げる
 * 「prop が変わったら state をリセットする」アンチパターンで、
 * 再オープンの最初のコミットが前回の拡大率のまま描画されてしまう。
 * 現在は呼び出し側が開いている間だけこのコンポーネントをマウントするので、
 * 拡大率は毎回 useState の初期値から始まり、リセット用の Effect は要らない。
 */
export function MermaidZoomModal({ html, onClose }: MermaidZoomModalProps) {
  const [scale, setScale] = useState(1);
  const areaRef = useRef<HTMLDivElement | null>(null);

  useEscapeDismiss(onClose);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
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
  }, []);

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
