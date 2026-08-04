import { useMemo } from 'react';
import { computeDocStats } from '../../lib/docScan.ts';
import { WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface StatsWidgetProps {
  source: string;
}

/**
 * 文書統計ウィジェット。文字数・見出し数・コードブロック数などの
 * 「文書の大きさ」を一目で出す。数字はすべて本文（コードブロックの中を
 * 除く走査）から導く純関数の結果で、サーバーには聞かない。
 */
export function StatsWidget({ source }: StatsWidgetProps) {
  const s = useMemo(() => computeDocStats(source), [source]);

  const rows: [string, string][] = [
    ['文字数', `${s.chars.toLocaleString()}`],
    ['空白を除く', `${s.charsNoSpace.toLocaleString()}`],
    ['行数', `${s.lines.toLocaleString()}`],
    ['単語数', `${s.words.toLocaleString()}`],
    ['見出し', `${s.headings}`],
    ['コード', `${s.codeBlocks}`],
    ['表', `${s.tables}`],
    ['リンク / 画像', `${s.links} / ${s.images}`],
    ['タスク', `${s.doneTasks} / ${s.tasks}`],
    ['推定読了', `約 ${s.readingMinutes} 分`],
  ];

  return (
    <WidgetPanel title="文書統計" testId="stats-widget">
      <dl className={styles.rows}>
        {rows.map(([key, value]) => (
          <div key={key} style={{ display: 'contents' }}>
            <dt className={styles.rowKey}>{key}</dt>
            <dd
              className={styles.rowValue}
              data-testid="stats-widget-value"
              data-key={key}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </WidgetPanel>
  );
}
