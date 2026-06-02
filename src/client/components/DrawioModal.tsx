import { useRef } from 'react';
import styles from './DrawioModal.module.css';

interface DrawioModalProps {
  open: boolean;
  code: string | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function DrawioModal({
  open,
  code,
  onClose,
  onToast,
}: DrawioModalProps) {
  const dlRef = useRef<HTMLAnchorElement>(null);

  if (!open || code === null) return null;

  function downloadDrawio() {
    if (!code || !dlRef.current) return;
    const mdata = JSON.stringify({ code, config: {} })
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="nymph" version="1.0">
  <diagram id="mermaid-${Date.now()}" name="Mermaid Export">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" page="1"
      pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <UserObject label="" mermaid_data="${mdata}" id="2">
          <mxCell style="shape=mxgraph.mermaid.undefined;html=1;whiteSpace=wrap;align=center;"
            vertex="1" parent="1">
            <mxGeometry x="80" y="80" width="600" height="400" as="geometry"/>
          </mxCell>
        </UserObject>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    dlRef.current.href = url;
    dlRef.current.download = `mermaid-${Date.now()}.drawio`;
    dlRef.current.click();
    URL.revokeObjectURL(url);
    onToast('.drawio をダウンロードしました');
  }

  function copyCode() {
    navigator.clipboard
      .writeText(code || '')
      .then(() => onToast('コードをコピーしました'));
  }

  return (
    <div
      id="drawio-modal"
      className={styles.modal}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* biome-ignore lint/a11y/useAnchorContent: hidden download trigger */}
      {/* biome-ignore lint/a11y/useValidAnchor: href is set programmatically before .click() */}
      <a ref={dlRef} tabIndex={-1} style={{ display: 'none' }} />
      <div id="drawio-box" className={styles.box}>
        <div className={styles.head}>
          <span className={styles.title}>draw.io エクスポート</span>
          <button
            type="button"
            className="btn icon"
            id="btn-close-drawio"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className={styles.hint}>
          <strong>.drawio ファイルをダウンロード</strong>して draw.io で開くか、
          コードをコピーして draw.io の <code>挿入 › Mermaid</code> にペースト。
        </div>
        <div className={styles.code} id="drawio-code">
          {code}
        </div>
        <div className={styles.foot}>
          <button
            type="button"
            className="btn primary"
            id="btn-dl-drawio"
            onClick={downloadDrawio}
          >
            ⬇ .drawio ダウンロード
          </button>
          <button
            type="button"
            className="btn"
            id="btn-copy-mermaid"
            onClick={copyCode}
          >
            コードをコピー
          </button>
          <span className="spacer" />
        </div>
      </div>
    </div>
  );
}
