import { useRef, useState } from 'react';
import { useEscapeDismiss, useOutsideDismiss } from '../hooks/useDismiss.ts';
import type { MarginCollapse } from '../lib/contentWidth.ts';
import { CONTENT_FONT_OPTIONS } from '../lib/fonts.ts';
import type { OutlineBadgeMode } from '../lib/outline.ts';
import {
  WIDGET_IDS,
  WIDGET_META,
  type WidgetId,
  type WidgetLayout,
  type WidgetPlacement,
  widgetPlacement,
} from '../lib/widgets.ts';
import styles from './SettingsPopover.module.css';

const OUTLINE_BADGE_OPTIONS: {
  id: OutlineBadgeMode;
  label: string;
  title: string;
  /** チェックポイントが無いと表示するものが無いモードか。 */
  needsCheckpoint?: boolean;
}[] = [
  { id: 'off', label: '非表示', title: '見出しにバッジを出さない' },
  {
    id: 'comments',
    label: 'コメント数',
    title: '見出し配下の未解決コメント数を出す',
  },
  {
    id: 'diff',
    label: '差分量',
    title: 'チェックポイントからの追加/削除行数を出す',
    needsCheckpoint: true,
  },
  { id: 'both', label: '両方', title: 'コメント数と差分量の両方を出す' },
];

interface SettingsPopoverProps {
  onToggleTheme: () => void;
  contentFontId: string;
  onChangeContentFont: (id: string) => void;
  /** 合字を描画するか。false なら fi や `=>` を 1 文字ずつ表示する。 */
  ligaturesEnabled: boolean;
  onToggleLigatures: () => void;
  marginCollapse: MarginCollapse;
  onToggleMargin: (side: 'left' | 'right') => void;
  /** ドラッグで指定中の本文幅（px）。null ならプリセットに従っている。 */
  manualWidth: number | null;
  onResetWidth: () => void;
  outlineBadgeMode: OutlineBadgeMode;
  onChangeOutlineBadgeMode: (mode: OutlineBadgeMode) => void;
  /** チェックポイント設定済みか。未設定なら「差分量」は選ばせない。 */
  checkpointSet: boolean;
  widgetLayout: WidgetLayout;
  onPlaceWidget: (id: WidgetId, placement: WidgetPlacement) => void;
}

/** ウィジェット 1 個ぶんの配置先の選択肢。 */
function placementOptions(
  id: WidgetId,
): { value: WidgetPlacement; key: string; label: string; title: string }[] {
  const meta = WIDGET_META[id];
  const options = [
    {
      value: 'left' as const,
      key: 'left',
      label: '左',
      title: `${meta.label}を左の枠に置く`,
    },
    {
      value: 'right' as const,
      key: 'right',
      label: '右',
      title: `${meta.label}を右の枠に置く`,
    },
  ];
  // 既定位置を持つウィジェット（タブ・コメント）だけ枠の外に戻せる。
  if (meta.defaultLabel === null) return options;
  return [
    ...options,
    {
      value: null,
      key: 'default',
      label: meta.defaultLabel,
      title: `${meta.label}を既定の位置（${meta.defaultLabel}）に戻す`,
    },
  ];
}

// 設定ポップオーバー。テーマ切替 / 本文フォント / リガチャ / 本文幅（左右
// マージン折りたたみ）をまとめる。本文幅は本文左右にフロートしていた ‹›ボタンを廃止し、
// ここへトグルとして移設したもの（localStorage キー・既定値は変更なし）。
// 折りたたみトグルは 3 段階のプリセットで、その間の任意幅は本文列の左右端の
// ハンドル（ContentResizer）をドラッグして決める。ここのリセットボタンで
// 手動幅を捨ててプリセットに戻せる。
export function SettingsPopover({
  onToggleTheme,
  contentFontId,
  onChangeContentFont,
  ligaturesEnabled,
  onToggleLigatures,
  marginCollapse,
  onToggleMargin,
  manualWidth,
  onResetWidth,
  outlineBadgeMode,
  onChangeOutlineBadgeMode,
  checkpointSet,
  widgetLayout,
  onPlaceWidget,
}: SettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useOutsideDismiss(rootRef, () => setOpen(false), { enabled: open });
  useEscapeDismiss(() => setOpen(false), open);

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
            <span className={styles.sectionTitle}>リガチャ</span>
            <button
              type="button"
              className={styles.toggle}
              data-testid="ligature-toggle"
              aria-pressed={ligaturesEnabled}
              title={
                ligaturesEnabled
                  ? '合字をやめて 1 文字ずつ表示する'
                  : '合字（fi や => の合成グリフ）を表示する'
              }
              onClick={onToggleLigatures}
            >
              リガチャを有効にする
            </button>
            <span className={styles.hint}>
              オフにすると fi や =&gt; を合成せず 1 文字ずつ表示します
            </span>
          </div>
          {/* 左右の枠に積むウィジェットを選ぶ。行ごとにセグメントコントロール
              なので、各行を role="group" にしてウィジェット名と関連付ける。 */}
          <fieldset className={`${styles.section} ${styles.fieldset}`}>
            <legend className={styles.sectionTitle}>ウィジェット配置</legend>
            <div className={styles.widgetRows} data-testid="widget-layout">
              {WIDGET_IDS.map((id) => {
                const meta = WIDGET_META[id];
                const current = widgetPlacement(widgetLayout, id);
                return (
                  <div
                    key={id}
                    className={styles.widgetRow}
                    data-testid={`widget-row-${id}`}
                  >
                    <span className={styles.widgetName}>{meta.label}</span>
                    {/* ボタンの表示は「左 / 右」だけなので、どのウィジェットの
                        話かが分かるよう読み上げ名にはウィジェット名を含める。 */}
                    <div className={styles.badgeModeGroup}>
                      {placementOptions(id).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={styles.badgeModeBtn}
                          data-testid={`widget-place-${id}-${opt.key}`}
                          aria-pressed={current === opt.value}
                          aria-label={opt.title}
                          title={opt.title}
                          onClick={() => onPlaceWidget(id, opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <span className={styles.hint}>
              左右の折りたたみ枠に積むウィジェットを選べます
            </span>
          </fieldset>
          {/* セグメントコントロールなので、見出しを legend にしてボタン群と
              プログラム的に関連付ける（span のままだと支援技術に伝わらない） */}
          <fieldset className={`${styles.section} ${styles.fieldset}`}>
            <legend className={styles.sectionTitle}>
              アウトラインのバッジ
            </legend>
            <div
              className={styles.badgeModeGroup}
              data-testid="outline-badge-mode"
            >
              {OUTLINE_BADGE_OPTIONS.map((opt) => {
                const disabled = Boolean(opt.needsCheckpoint) && !checkpointSet;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={styles.badgeModeBtn}
                    data-testid={`outline-badge-${opt.id}`}
                    aria-pressed={outlineBadgeMode === opt.id}
                    disabled={disabled}
                    title={
                      disabled
                        ? 'チェックポイントを設定すると選べます'
                        : opt.title
                    }
                    onClick={() => onChangeOutlineBadgeMode(opt.id)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <span className={styles.hint}>
              見出しの右に表示するバッジを選べます
            </span>
          </fieldset>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>本文幅</span>
            <div className={styles.toggles}>
              <button
                type="button"
                className={styles.toggle}
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
                className={styles.toggle}
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
                className={styles.toggle}
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
            <span className={styles.hint}>
              本文の左右端をドラッグすると幅を自由に変えられます
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
