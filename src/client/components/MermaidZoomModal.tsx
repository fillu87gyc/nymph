import styles from './MermaidZoomModal.module.css';

interface MermaidZoomModalProps {
  open: boolean;
  html: string | null;
  onClose: () => void;
}

export function MermaidZoomModal({
  open,
  html,
  onClose,
}: MermaidZoomModalProps) {
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
          <button
            type="button"
            className="btn icon"
            id="btn-close-mermaid-zoom"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div
          className={styles.area}
          id="mermaid-zoom-area"
          // 既にレンダリング済みの mermaid SVG（mermaid 自身が DOM に書き込んだもの）
          // をそのまま拡大表示する。元データは parseBlocks で sanitize 済みの
          // Markdown から mermaid が生成したものなので再サニタイズ不要。
          // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid が描画した SVG をそのまま複製
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
