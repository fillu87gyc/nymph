import type { BookmarkEntry, RecentEntry } from '../../types.ts';
import { WidgetEmpty, WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface RecentWidgetProps {
  recentFiles: RecentEntry[];
  bookmarks: BookmarkEntry[];
  activeFile: string | null;
  onOpenFile: (path: string) => void;
  onOpenDir: (path: string) => void;
}

/** 一覧に出す件数の上限（枠が縦に長くなりすぎないように）。 */
const MAX_RECENT = 10;

/**
 * 最近 / ブックマークウィジェット。
 *
 * どちらもツールバーのメニュー（🕘）を開かないと見えなかったものを、枠に
 * 常設して一覧できるようにする。データ源はメニューと同じ `/recent` と
 * `/bookmarks` なので、片方で開いたファイルはもう片方にも即座に効く。
 */
export function RecentWidget({
  recentFiles,
  bookmarks,
  activeFile,
  onOpenFile,
  onOpenDir,
}: RecentWidgetProps) {
  const recent = recentFiles.slice(0, MAX_RECENT);
  const empty = recent.length === 0 && bookmarks.length === 0;

  return (
    <WidgetPanel
      title="最近 / ブックマーク"
      testId="recent-widget"
      meta={empty ? undefined : `${recent.length} / ${bookmarks.length}`}
    >
      {empty && <WidgetEmpty>まだ履歴もブックマークもありません</WidgetEmpty>}
      {recent.length > 0 && (
        <>
          <div className={styles.sectionLabel}>最近開いた</div>
          <div className={styles.list}>
            {recent.map((f) => (
              <button
                type="button"
                key={f.path}
                className={styles.item}
                data-testid="recent-widget-file"
                data-active={String(f.path === activeFile)}
                title={f.path}
                onClick={() => onOpenFile(f.path)}
              >
                <span className={styles.itemText}>{f.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {bookmarks.length > 0 && (
        <>
          <div className={styles.sectionLabel}>ブックマーク</div>
          <div className={styles.list}>
            {bookmarks.map((b) => (
              <button
                type="button"
                key={b.path}
                className={styles.item}
                data-testid="recent-widget-bookmark"
                data-type={b.type}
                title={b.path}
                onClick={() =>
                  b.type === 'dir' ? onOpenDir(b.path) : onOpenFile(b.path)
                }
              >
                <span className={styles.itemText}>
                  {b.type === 'dir' ? '📁 ' : ''}
                  {b.name}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </WidgetPanel>
  );
}
