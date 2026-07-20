import type { TocItem } from '../lib/toc.ts';
import styles from './TocPanel.module.css';

interface TocPanelProps {
  items: TocItem[];
  onSelect: (lineStart: number) => void;
}

export function TocPanel({ items, onSelect }: TocPanelProps) {
  return (
    <aside id="toc-panel" className={styles.sidebar} data-testid="toc-panel">
      <div className={styles.header}>目次</div>
      {items.length === 0 ? (
        <div className={styles.empty}>見出しがありません</div>
      ) : (
        <nav className={styles.list}>
          {items.map((item) => (
            <button
              type="button"
              key={item.key}
              className={styles.item}
              data-testid="toc-item"
              data-level={item.level}
              style={{ paddingLeft: 8 + (item.level - 1) * 14 }}
              onClick={() => onSelect(item.lineStart)}
            >
              {item.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
