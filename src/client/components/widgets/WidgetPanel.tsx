import type { ReactNode } from 'react';
import styles from './widgets.module.css';

interface WidgetPanelProps {
  /** 枠のヘッダーに出す名前（WIDGET_META の label と揃える）。 */
  title: string;
  testId: string;
  /** 見出しの右に出す件数などの補助情報。 */
  meta?: ReactNode;
  /** 一覧の上に出す操作列（検索入力・絞り込みボタンなど）。 */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * 第2弾ウィジェットの共通シェル。
 *
 * 枠（WidgetSlot）の中で縦幅いっぱいに広がり、あふれた分だけ中でスクロール
 * する、という骨格はどのウィジェットでも同じ。ヘッダーの体裁（小さな
 * 大文字のタイトル + 右端の件数）もアウトラインパネルと揃える。
 */
export function WidgetPanel({
  title,
  testId,
  meta,
  toolbar,
  children,
}: WidgetPanelProps) {
  return (
    <section className={styles.panel} data-testid={testId}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>{title}</span>
        {meta != null && (
          <span className={styles.headerMeta} data-testid={`${testId}-meta`}>
            {meta}
          </span>
        )}
      </div>
      {toolbar}
      <div className={styles.body}>{children}</div>
    </section>
  );
}

/** 出すものが無いときの案内。ウィジェットごとに文言だけ変える。 */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return (
    <div className={styles.empty} data-testid="widget-empty-note">
      {children}
    </div>
  );
}
