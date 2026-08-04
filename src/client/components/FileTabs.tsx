import type { FileEntry } from '../types.ts';
import styles from './FileTabs.module.css';

/**
 * タブの並べ方。
 * - horizontal: ツールバー直下の全幅の横行（既定位置）
 * - vertical: 左右のウィジェット枠に置いたときの縦リスト（VSCode の
 *   Open Editors 相当）
 */
export type FileTabsOrientation = 'horizontal' | 'vertical';

interface FileTabsProps {
  files: FileEntry[];
  activeFile: string | null;
  orientation?: FileTabsOrientation;
  onSwitch: (path: string) => void;
  onClose: (path: string) => void;
}

export function FileTabs({
  files,
  activeFile,
  orientation = 'horizontal',
  onSwitch,
  onClose,
}: FileTabsProps) {
  const vertical = orientation === 'vertical';

  // 横行は複数ファイルを行き来する必要があるときだけ出す（mo 方式）。
  // 1 ファイル以下では常時表示せず、2 ファイル以上で自動的に現れる。
  // 縦置きはユーザーが自分で枠に置いたウィジェットなので、1 ファイルでも
  // 出す（空の枠だけが残ると、置いたはずのウィジェットが消えたように見える）。
  if (vertical ? files.length === 0 : files.length <= 1) return null;

  const tabs = files.map((f) => {
    const isActive = f.path === activeFile;
    return (
      <button
        key={f.path}
        className={styles.tab}
        data-active={String(isActive)}
        title={vertical ? f.path : undefined}
        onClick={() => !isActive && onSwitch(f.path)}
      >
        <span className={styles.tabName}>{f.name}</span>
        <span
          className={styles.tabClose}
          data-testid="tab-close"
          aria-hidden="true"
          onClick={(e) => {
            e.stopPropagation();
            onClose(f.path);
          }}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M1 1l6 6M7 1L1 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
    );
  });

  if (!vertical) {
    return (
      <div
        id="file-tabs"
        className={styles.fileTabs}
        data-orientation="horizontal"
      >
        {tabs}
      </div>
    );
  }

  return (
    <aside
      id="file-tabs"
      className={styles.tabsWidget}
      data-orientation="vertical"
      data-testid="tabs-widget"
    >
      <div className={styles.header}>タブ</div>
      <div className={styles.tabList}>{tabs}</div>
    </aside>
  );
}
