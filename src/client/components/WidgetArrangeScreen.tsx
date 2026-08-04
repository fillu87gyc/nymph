import { Fragment, useEffect, useRef, useState } from 'react';
import { useEscapeDismiss } from '../hooks/useDismiss.ts';
import {
  availableWidgets,
  moveWidget,
  type SlotId,
  WIDGET_META,
  type WidgetId,
  type WidgetLayout,
  type WidgetPlacement,
} from '../lib/widgets.ts';
import styles from './WidgetArrangeScreen.module.css';

/**
 * 配置画面の列。左から「利用可能」「左の枠」「右の枠」の順に並べる。
 * `available` は枠に入っていない状態＝そのウィジェット本来の既定位置。
 */
type ColumnId = 'available' | SlotId;

const COLUMN_ORDER: ColumnId[] = ['available', 'left', 'right'];

const COLUMN_LABEL: Record<ColumnId, string> = {
  available: '利用可能',
  left: '左の枠',
  right: '右の枠',
};

/** 列 → 配置モデル上の置き場所。 */
function columnPlacement(col: ColumnId): WidgetPlacement {
  return col === 'available' ? null : col;
}

interface WidgetArrangeScreenProps {
  layout: WidgetLayout;
  /** `index` は「そのウィジェットを抜いたあとの配置先の配列」での挿入位置。 */
  onMove: (id: WidgetId, placement: WidgetPlacement, index: number) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * ウィジェット配置画面。
 *
 * メインの画面とは別に開く全画面の設定画面で、「利用可能」（＝枠に入れず
 * 既定の位置に出す）一覧と、左右の枠の中身をドラッグ＆ドロップで行き来
 * させる。枠の中では上下の並び順もドラッグで変えられる。
 *
 * ドラッグできない環境・キーボード操作のために、チップにフォーカスした
 * 状態の矢印キーでも同じ操作ができる（← → で列を移動、↑ ↓ で枠内の並び替え）。
 * 変更は即座に反映・保存されるので「保存」ボタンは持たない。
 */
export function WidgetArrangeScreen({
  layout,
  onMove,
  onReset,
  onClose,
}: WidgetArrangeScreenProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  /** ドラッグ中のウィジェット。null ならドラッグしていない。 */
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  /** いま落とすとどこに入るか（ドロップ位置のハイライト用）。 */
  const [dropAt, setDropAt] = useState<{ col: ColumnId; index: number } | null>(
    null,
  );
  /** 支援技術への読み上げと、操作結果の手掛かり。 */
  const [status, setStatus] = useState('');
  /**
   * キーボードで動かしたチップは列をまたぐと DOM ごと作り直されてフォーカスが
   * 外れる。動かした直後に同じチップへフォーカスを戻すための合図。
   */
  const [refocus, setRefocus] = useState<{ id: WidgetId; seq: number } | null>(
    null,
  );

  useEscapeDismiss(onClose);

  useEffect(() => {
    if (!refocus) return;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-testid="widget-chip-${refocus.id}"]`)
      ?.focus();
  }, [refocus]);

  const columns: Record<ColumnId, WidgetId[]> = {
    available: availableWidgets(layout),
    left: layout.left,
    right: layout.right,
  };

  /** その列に落とせるか。スロット専用ウィジェットは枠の外へ出せない。 */
  function canDrop(col: ColumnId): boolean {
    if (dragging === null) return false;
    return col !== 'available' || !WIDGET_META[dragging].slotOnly;
  }

  function commit(id: WidgetId, col: ColumnId, index: number) {
    const placement = columnPlacement(col);
    // 「利用可能」は並び順を持たないので、位置は常に 0 として扱う
    // （モデル側も placement が null なら index を見ない）。
    const at = placement === null ? 0 : index;
    // 読み上げ文は「丸めたあとの実際の位置」で作りたいので、モデルに聞く。
    const next = moveWidget(layout, id, placement, at);
    onMove(id, placement, at);
    setStatus(describeResult(next, id));
  }

  function handleDrop(col: ColumnId, index: number) {
    const id = dragging;
    setDragging(null);
    setDropAt(null);
    if (id === null || !canDrop(col)) return;
    commit(id, col, index);
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
    id: WidgetId,
    col: ColumnId,
    index: number,
  ) {
    // 「利用可能」は WIDGET_IDS 順の固定並びなので、上下しても意味がない。
    if (e.key === 'ArrowUp' && col !== 'available') {
      commit(id, col, index - 1);
    } else if (e.key === 'ArrowDown' && col !== 'available') {
      commit(id, col, index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dest = neighborColumn(col, e.key === 'ArrowLeft' ? -1 : 1, id);
      if (dest === null) return;
      e.preventDefault();
      // 列をまたぐときは末尾に積む（ドラッグと違って狙う位置が無いため）。
      commit(id, dest, columns[dest].length);
      setRefocus((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
      return;
    } else {
      return;
    }
    e.preventDefault();
    setRefocus((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
  }

  function renderChip(id: WidgetId, col: ColumnId, index: number) {
    const meta = WIDGET_META[id];
    const position =
      col === 'available'
        ? `利用可能（既定の位置: ${meta.defaultLabel}）`
        : `${COLUMN_LABEL[col]} ${index + 1} / ${columns[col].length}`;
    return (
      <button
        type="button"
        className={styles.chip}
        data-testid={`widget-chip-${id}`}
        data-widget={id}
        data-column={col}
        data-dragging={String(dragging === id)}
        draggable
        aria-label={`${meta.label}（現在: ${position}）`}
        title="ドラッグ、または矢印キーで移動できます"
        onDragStart={(e) => {
          // Firefox はデータが載っていないとドラッグを始めない。
          e.dataTransfer.setData('text/plain', id);
          e.dataTransfer.effectAllowed = 'move';
          setDragging(id);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDropAt(null);
        }}
        onKeyDown={(e) => handleKeyDown(e, id, col, index)}
      >
        <span aria-hidden="true" className={styles.grip}>
          ⠿
        </span>
        <span className={styles.chipLabel}>{meta.label}</span>
        {col === 'available' && meta.defaultLabel !== null && (
          <span className={styles.chipNote}>{meta.defaultLabel}</span>
        )}
      </button>
    );
  }

  /** 枠のあいだの差し込み位置。ドラッグ中だけ光る。 */
  function renderGap(col: SlotId, index: number) {
    const active = dropAt?.col === col && dropAt.index === index;
    return (
      <li
        key={`gap-${index}`}
        className={styles.gap}
        data-testid={`widget-drop-${col}-${index}`}
        data-active={String(active)}
        onDragOver={(e) => {
          if (!canDrop(col)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropAt({ col, index });
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(col, index);
        }}
      />
    );
  }

  /**
   * 列 1 本。左右の枠は差し込み位置（gap）を持ち、そこを外して落とすと末尾に
   * 積まれる。「利用可能」は並び順に意味が無いので gap を持たない。
   */
  function renderList(col: ColumnId) {
    const items = columns[col];
    const slotted = col !== 'available';
    return (
      <ul
        className={styles.list}
        data-testid={`widget-arrange-list-${col}`}
        data-column={col}
        data-droppable={String(canDrop(col))}
        onDragOver={(e) => {
          // gap が拾ったドラッグはそちらに任せる（末尾へ上書きしない）。
          if (e.defaultPrevented || !canDrop(col)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropAt({ col, index: items.length });
        }}
        onDrop={(e) => {
          if (e.defaultPrevented) return;
          e.preventDefault();
          handleDrop(col, items.length);
        }}
      >
        {items.length === 0 && (
          <li className={styles.empty} data-testid={`widget-empty-${col}`}>
            {slotted ? 'ここにドラッグ' : 'すべて枠に入っています'}
          </li>
        )}
        {items.map((id, i) => (
          <Fragment key={id}>
            {slotted && renderGap(col, i)}
            <li className={styles.row}>{renderChip(id, col, i)}</li>
          </Fragment>
        ))}
        {slotted && renderGap(col, items.length)}
      </ul>
    );
  }

  return (
    <div
      id="widget-arrange"
      ref={rootRef}
      className={styles.screen}
      data-testid="widget-arrange"
      data-dragging={String(dragging !== null)}
      role="dialog"
      aria-modal="true"
      aria-label="ウィジェット配置"
      // ここでのドラッグは配置の並べ替えであって、ファイルのドロップ
      // （#app のオーバーレイ）ではない。上へ伝えない。
      onDragEnter={(e) => e.stopPropagation()}
      onDragOver={(e) => e.stopPropagation()}
      onDragLeave={(e) => e.stopPropagation()}
      onDrop={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setDragging(null);
        setDropAt(null);
      }}
    >
      <header className={styles.head}>
        <h1 className={styles.title}>ウィジェット配置</h1>
        <p className={styles.lead}>
          利用可能なウィジェットを左右の枠へドラッグして並べます。枠の中では
          上下の順番も入れ替えられます。
        </p>
        <div className={styles.headActions}>
          <button
            type="button"
            className="btn"
            data-testid="widget-arrange-reset"
            title="既定の配置（左＝エクスプローラー / 右＝アウトライン）に戻す"
            onClick={() => {
              onReset();
              setStatus('既定の配置に戻しました');
            }}
          >
            既定に戻す
          </button>
          <button
            type="button"
            className="btn"
            id="btn-widget-arrange-close"
            data-testid="widget-arrange-close"
            title="配置画面を閉じる（Esc）"
            onClick={onClose}
          >
            ✕ 閉じる
          </button>
        </div>
      </header>
      <div className={styles.body}>
        <section className={styles.palette} aria-label="利用可能なウィジェット">
          <h2 className={styles.colTitle}>{COLUMN_LABEL.available}</h2>
          {renderList('available')}
          <p className={styles.hint}>
            ここに戻すと、そのウィジェット本来の位置（タブ＝
            {WIDGET_META.tabs.defaultLabel} / コメント＝
            {WIDGET_META.comments.defaultLabel}）に出ます。エクスプローラーと
            アウトラインは必ず左右どちらかの枠に入ります。
          </p>
        </section>
        <section className={styles.preview} aria-label="画面の配置">
          <div className={styles.column}>
            <h2 className={styles.colTitle}>{COLUMN_LABEL.left}</h2>
            {renderList('left')}
          </div>
          <div className={styles.canvas} aria-hidden="true">
            <span className={styles.canvasLabel}>本文</span>
          </div>
          <div className={styles.column}>
            <h2 className={styles.colTitle}>{COLUMN_LABEL.right}</h2>
            {renderList('right')}
          </div>
        </section>
      </div>
      <footer className={styles.foot}>
        <span className={styles.hint}>
          キーボードでも操作できます: チップを選んで ← → で枠を移動、↑ ↓
          で並べ替え
        </span>
        <span
          className={styles.status}
          data-testid="widget-arrange-status"
          role="status"
          aria-live="polite"
        >
          {status}
        </span>
      </footer>
    </div>
  );
}

/** 隣の列。スロット専用ウィジェットは「利用可能」を飛ばす（行き先が無い）。 */
function neighborColumn(
  col: ColumnId,
  step: -1 | 1,
  id: WidgetId,
): ColumnId | null {
  let i = COLUMN_ORDER.indexOf(col) + step;
  while (i >= 0 && i < COLUMN_ORDER.length) {
    const dest = COLUMN_ORDER[i];
    if (dest !== 'available' || !WIDGET_META[id].slotOnly) return dest;
    i += step;
  }
  return null;
}

/** 移動後の配置から読み上げ文を作る。 */
function describeResult(layout: WidgetLayout, id: WidgetId): string {
  const label = WIDGET_META[id].label;
  const slot = (['left', 'right'] as SlotId[]).find((s) =>
    layout[s].includes(id),
  );
  if (!slot) {
    return `${label}を${COLUMN_LABEL.available}（${WIDGET_META[id].defaultLabel}）に戻しました`;
  }
  return `${label}を${COLUMN_LABEL[slot]}の${layout[slot].indexOf(id) + 1}番目に置きました`;
}
