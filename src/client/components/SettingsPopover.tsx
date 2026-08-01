import { useEffect, useRef, useState } from 'react';
import type { MarginCollapse } from '../lib/contentWidth.ts';
import { CONTENT_FONT_OPTIONS } from '../lib/fonts.ts';
import type { OutlineBadgeMode } from '../lib/outline.ts';
import styles from './SettingsPopover.module.css';

const OUTLINE_BADGE_OPTIONS: { id: OutlineBadgeMode; label: string }[] = [
  { id: 'off', label: '非表示' },
  { id: 'comments', label: 'コメント数' },
  { id: 'diff', label: '差分量' },
  { id: 'both', label: '両方' },
];

interface SettingsPopoverProps {
  onToggleTheme: () => void;
  contentFontId: string;
  onChangeContentFont: (id: string) => void;
  marginCollapse: MarginCollapse;
  onToggleMargin: (side: 'left' | 'right') => void;
  /** ドラッグで指定中の本文幅（px）。null ならプリセットに従っている。 */
  manualWidth: number | null;
  onResetWidth: () => void;
  outlineBadgeMode: OutlineBadgeMode;
  onChangeOutlineBadgeMode: (mode: OutlineBadgeMode) => void;
}

// 設定ポップオーバー。テーマ切替 / 本文フォント / 本文幅（左右マージン折り
// たたみ）をまとめる。本文幅は本文左右にフロートしていた ‹›ボタンを廃止し、
// ここへトグルとして移設したもの（localStorage キー・既定値は変更なし）。
// 折りたたみトグルは 3 段階のプリセットで、その間の任意幅は本文列の左右端の
// ハンドル（ContentResizer）をドラッグして決める。ここのリセットボタンで
// 手動幅を捨ててプリセットに戻せる。
export function SettingsPopover({
  onToggleTheme,
  contentFontId,
  onChangeContentFont,
  marginCollapse,
  onToggleMargin,
  manualWidth,
  onResetWidth,
  outlineBadgeMode,
  onChangeOutlineBadgeMode,
}: SettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className="btn icon"
        data-testid="settings-menu-btn"
        data-active={String(open)}
        title="設定"
        onClick={() => setOpen((o) => !o)}
      >
        ⚙
      </button>
      {open && (
        <div className={styles.dropdown} data-testid="settings-menu">
          <div className={styles.section}>
            <span className={styles.sectionTitle}>テーマ</span>
            <button
              type="button"
              className="btn icon"
              id="btn-theme"
              title="テーマ切替"
              onClick={onToggleTheme}
            >
              ◐ テーマ切替
            </button>
          </div>
          <div className={styles.section}>
            <label
              className={styles.sectionTitle}
              htmlFor="content-font-select"
            >
              本文フォント
            </label>
            <select
              id="content-font-select"
              data-testid="content-font-select"
              className={styles.fontSelect}
              title="本文フォント"
              value={contentFontId}
              onChange={(e) => onChangeContentFont(e.target.value)}
            >
              {CONTENT_FONT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>アウトラインのバッジ</span>
            <div
              className={styles.badgeModeGroup}
              data-testid="outline-badge-mode"
            >
              {OUTLINE_BADGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={styles.badgeModeBtn}
                  data-testid={`outline-badge-${opt.id}`}
                  aria-pressed={outlineBadgeMode === opt.id}
                  onClick={() => onChangeOutlineBadgeMode(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className={styles.widthHint}>
              見出しの右に表示するバッジを選べます
            </span>
          </div>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>本文幅</span>
            <div className={styles.widthToggles}>
              <button
                type="button"
                className={styles.widthToggle}
                data-testid="margin-toggle-left"
                aria-pressed={marginCollapse.left}
                title={
                  marginCollapse.left
                    ? '左マージンを表示'
                    : '左マージンを折りたたんで本文を広げる'
                }
                onClick={() => onToggleMargin('left')}
              >
                左マージンを折りたたむ
              </button>
              <button
                type="button"
                className={styles.widthToggle}
                data-testid="margin-toggle-right"
                aria-pressed={marginCollapse.right}
                title={
                  marginCollapse.right
                    ? '右マージンを表示'
                    : '右マージンを折りたたんで本文を広げる'
                }
                onClick={() => onToggleMargin('right')}
              >
                右マージンを折りたたむ
              </button>
              <button
                type="button"
                className={styles.widthToggle}
                data-testid="content-width-reset"
                disabled={manualWidth === null}
                title="ドラッグで指定した幅を捨てて既定の幅に戻す"
                onClick={onResetWidth}
              >
                {manualWidth === null
                  ? '幅をリセット'
                  : `幅をリセット（${manualWidth}px）`}
              </button>
            </div>
            <span className={styles.widthHint}>
              本文の左右端をドラッグすると幅を自由に変えられます
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
