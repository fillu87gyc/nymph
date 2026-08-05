import { useMemo } from 'react';
import { extractDiagrams } from '../../lib/docScan.ts';
import { WidgetEmpty, WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface DiagramsWidgetProps {
  source: string;
  onSelectLine: (line: number) => void;
}

/**
 * 図（Mermaid）一覧ウィジェット。
 *
 * AI が書いた設計ドキュメントのレビューでは図だけを追いたいことが多いので、
 * 本文中の ```mermaid / ```mmd を集めて、選ぶとその図へ飛ぶ。サムネイルは
 * 出さない（同じ図を 2 回描くと mermaid の初期化コストが二重になるうえ、
 * 枠の幅では潰れて読めない）。代わりに図の種類と先頭行を手掛かりに出す。
 */
export function DiagramsWidget({ source, onSelectLine }: DiagramsWidgetProps) {
  const diagrams = useMemo(() => extractDiagrams(source), [source]);

  return (
    <WidgetPanel
      title="図の一覧"
      testId="diagrams-widget"
      meta={diagrams.length > 0 ? `${diagrams.length}` : undefined}
    >
      {diagrams.length === 0 && (
        <WidgetEmpty>Mermaid の図がありません</WidgetEmpty>
      )}
      <div className={styles.list}>
        {diagrams.map((d, i) => (
          <button
            type="button"
            key={`${d.line}`}
            className={`${styles.item} ${styles.itemStack}`}
            data-testid="diagrams-widget-item"
            data-line={d.line}
            title={`${d.line}行目`}
            onClick={() => onSelectLine(d.line)}
          >
            <span className={styles.itemText}>
              {d.kind || `図 ${i + 1}`}
              <span className={styles.lineNo}> :{d.line}</span>
            </span>
            {d.preview && <span className={styles.itemSub}>{d.preview}</span>}
          </button>
        ))}
      </div>
    </WidgetPanel>
  );
}
