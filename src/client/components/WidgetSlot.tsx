import type { ReactNode } from 'react';
import { type SlotId, WIDGET_META, type WidgetId } from '../lib/widgets.ts';
import styles from './WidgetSlot.module.css';

interface WidgetSlotProps {
  side: SlotId;
  /** このスロットに積むウィジェット（先頭が上）。 */
  widgets: WidgetId[];
  /**
   * ウィジェット本体を描く。出す条件を満たしていなければ null を返す。
   * 中身が 1 つも無いスロットは枠ごと消える（空のサイドバーを出さない）。
   */
  render: (id: WidgetId) => ReactNode;
}

/**
 * 画面左右のウィジェット枠。中身のウィジェットを縦に積む。
 *
 * 枠の幅・境界線・背景はここが持ち、中のウィジェットは幅いっぱいに広がる。
 * こうしておくと、複数のウィジェットを積んでも 1 枚のサイドバーとして
 * 揃って見える（各ウィジェットが自前の幅を持っていると段差ができる）。
 */
export function WidgetSlot({ side, widgets, render }: WidgetSlotProps) {
  const rendered = widgets
    .map((id) => ({ id, node: render(id) }))
    .filter((w) => w.node !== null && w.node !== false);

  if (rendered.length === 0) return null;

  return (
    <div
      className={styles.slot}
      data-side={side}
      data-testid={`widget-slot-${side}`}
    >
      {rendered.map(({ id, node }) => (
        <div
          key={id}
          className={styles.item}
          data-widget={id}
          data-grows={String(WIDGET_META[id].grows)}
        >
          {node}
        </div>
      ))}
    </div>
  );
}
