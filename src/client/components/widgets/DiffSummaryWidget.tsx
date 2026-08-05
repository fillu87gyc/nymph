import { useMemo } from 'react';
import { summarizeDiff } from '../../lib/diffSummary.ts';
import type { DiffResponse } from '../../types.ts';
import { WidgetEmpty, WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface DiffSummaryWidgetProps {
  diffData: DiffResponse | null;
  checkpointSet: boolean;
  /** 差分チェックモードへ入って対象行をハイライトする。 */
  onSelectDiffLine: (side: 'old' | 'new', line: number) => void;
}

/**
 * 差分サマリウィジェット。
 *
 * チェックポイントからの変更を、差分チェックモードを開かずに俯瞰する。
 * ±行数の合計と、変更のかたまりごとの ±件数・代表行を並べ、選ぶと差分
 * チェックモードへ切り替えてその行をハイライトする（コメントからの
 * ジャンプと同じ経路）。
 */
export function DiffSummaryWidget({
  diffData,
  checkpointSet,
  onSelectDiffLine,
}: DiffSummaryWidgetProps) {
  const summary = useMemo(
    () => summarizeDiff(diffData?.lines ?? []),
    [diffData],
  );

  return (
    <WidgetPanel
      title="差分サマリ"
      testId="diffsummary-widget"
      meta={
        checkpointSet ? (
          <>
            <span className={styles.add}>+{summary.added}</span>{' '}
            <span className={styles.del}>-{summary.deleted}</span>
          </>
        ) : undefined
      }
    >
      {!checkpointSet && (
        <WidgetEmpty>
          チェックポイントを設定すると、そこからの変更が並びます
        </WidgetEmpty>
      )}
      {checkpointSet && summary.hunks.length === 0 && (
        <WidgetEmpty>チェックポイントからの変更はありません</WidgetEmpty>
      )}
      <div className={styles.list}>
        {summary.hunks.map((h) => (
          <button
            type="button"
            key={h.g}
            className={`${styles.item} ${styles.itemStack}`}
            data-testid="diffsummary-widget-item"
            data-side={h.side}
            data-line={h.line}
            title={`${h.side === 'new' ? '新' : '旧'}${h.line}行目`}
            onClick={() => onSelectDiffLine(h.side, h.line)}
          >
            <span className={styles.itemText}>
              {h.added > 0 && <span className={styles.add}>+{h.added}</span>}
              {h.added > 0 && h.deleted > 0 && ' '}
              {h.deleted > 0 && (
                <span className={styles.del}>-{h.deleted}</span>
              )}
              <span className={styles.lineNo}> :{h.line}</span>
            </span>
            <span className={styles.itemSub}>{h.preview || '（空行）'}</span>
          </button>
        ))}
      </div>
    </WidgetPanel>
  );
}
