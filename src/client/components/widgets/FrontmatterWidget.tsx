import { useMemo } from 'react';
import { parseFrontmatter } from '../../lib/docScan.ts';
import { WidgetEmpty, WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface FrontmatterWidgetProps {
  source: string;
}

/**
 * frontmatter ウィジェット。本文の先頭に置かれた YAML メタ情報
 * （title / status / tags など）をキーと値の表にして常に見えるようにする。
 * 本文側の表示はいじらない（折りたたみ表示は別テーマ）。
 */
export function FrontmatterWidget({ source }: FrontmatterWidgetProps) {
  const fm = useMemo(() => parseFrontmatter(source), [source]);

  return (
    <WidgetPanel
      title="frontmatter"
      testId="frontmatter-widget"
      meta={fm && fm.fields.length > 0 ? `${fm.fields.length}` : undefined}
    >
      {(!fm || fm.fields.length === 0) && (
        <WidgetEmpty>frontmatter がありません</WidgetEmpty>
      )}
      {fm && fm.fields.length > 0 && (
        <dl className={styles.rows}>
          {fm.fields.map((f) => (
            <div key={f.key} style={{ display: 'contents' }}>
              <dt className={styles.rowKey} data-testid="frontmatter-key">
                {f.key}
              </dt>
              <dd
                className={`${styles.rowValue} ${styles.rowValueText}`}
                data-testid="frontmatter-value"
              >
                {f.value || '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </WidgetPanel>
  );
}
