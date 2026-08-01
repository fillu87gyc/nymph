import {
  type OutlineBadgeMode,
  type OutlineStats,
  resolveEffectiveBadgeMode,
} from '../lib/outline.ts';
import type { TocItem } from '../lib/toc.ts';
import styles from './TocPanel.module.css';

interface TocPanelProps {
  items: TocItem[];
  onSelect: (lineStart: number) => void;
  /** 見出しキー（TocItem.key）ごとの未解決コメント数・diff増減。 */
  stats?: Map<string, OutlineStats>;
  /** バッジ種別。省略時はバッジなし（従来の目次と同じ見た目）。 */
  badgeMode?: OutlineBadgeMode;
  /** チェックポイントが設定済みか（diff バッジのフォールバック判定用）。 */
  hasCheckpoint?: boolean;
}

export function TocPanel({
  items,
  onSelect,
  stats,
  badgeMode = 'off',
  hasCheckpoint = false,
}: TocPanelProps) {
  const effectiveMode = resolveEffectiveBadgeMode(badgeMode, hasCheckpoint);
  const showComments = effectiveMode === 'comments' || effectiveMode === 'both';
  const showDiff = effectiveMode === 'diff' || effectiveMode === 'both';

  let totalOpen = 0;
  if (stats && showComments) {
    for (const s of stats.values()) totalOpen += s.openComments;
  }

  return (
    <aside id="toc-panel" className={styles.sidebar} data-testid="toc-panel">
      <div className={styles.header}>
        <span className={styles.headerTitle}>アウトライン</span>
        {totalOpen > 0 && (
          <span className={styles.headerMeta} data-testid="toc-header-meta">
            未解決 {totalOpen}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className={styles.empty}>見出しがありません</div>
      ) : (
        <nav className={styles.list}>
          {items.map((item) => {
            const stat = stats?.get(item.key);
            const hasCommentBadge =
              showComments && (stat?.openComments ?? 0) > 0;
            const hasDiffBadge =
              showDiff && stat != null && (stat.added > 0 || stat.deleted > 0);
            return (
              <button
                type="button"
                key={item.key}
                className={styles.item}
                data-testid="toc-item"
                data-level={item.level}
                style={{ paddingLeft: 8 + (item.level - 1) * 14 }}
                onClick={() => onSelect(item.lineStart)}
              >
                <span className={styles.itemText}>{item.text}</span>
                {(hasCommentBadge || hasDiffBadge) && (
                  <span className={styles.badges}>
                    {hasCommentBadge && (
                      <span
                        className={styles.badgeComments}
                        data-testid="toc-badge-comments"
                      >
                        <span className={styles.dot} />
                        {stat?.openComments}
                      </span>
                    )}
                    {hasDiffBadge && (
                      <span
                        className={styles.badgeDiff}
                        data-testid="toc-badge-diff"
                      >
                        {(stat?.added ?? 0) > 0 && (
                          <span className={styles.badgeDiffAdd}>
                            +{stat?.added}
                          </span>
                        )}
                        {(stat?.deleted ?? 0) > 0 && (
                          <span className={styles.badgeDiffDel}>
                            -{stat?.deleted}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
