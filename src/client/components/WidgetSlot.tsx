import { type ReactNode, useCallback, useRef, useState } from 'react';
import {
  DEFAULT_SLOT_WIDTHS,
  MAX_SLOT_WIDTH,
  MIN_SLOT_WIDTH,
  nextSlotWidth,
  SLOT_WIDTH_STEP,
} from '../lib/slotWidth.ts';
import { type SlotId, WIDGET_META, type WidgetId } from '../lib/widgets.ts';
import styles from './WidgetSlot.module.css';

interface WidgetSlotProps {
  side: SlotId;
  /** このスロットに積むウィジェット（先頭が上）。 */
  widgets: WidgetId[];
  /** 枠の幅（px）。ドラッグで変えられる。 */
  width: number;
  /**
   * ウィジェット本体を描く。出す条件を満たしていなければ null を返す。
   * 中身が 1 つも無いスロットは枠ごと消える（空のサイドバーを出さない）。
   */
  render: (id: WidgetId) => ReactNode;
  /** ドラッグ中の連続更新（保存はしない）。 */
  onWidthChange: (side: SlotId, width: number) => void;
  /** 幅の確定（localStorage への保存タイミング）。 */
  onWidthCommit: (side: SlotId, width: number) => void;
}

/**
 * 画面左右のウィジェット枠。中身のウィジェットを縦に積む。
 *
 * 枠の幅・境界線・背景はここが持ち、中のウィジェットは幅いっぱいに広がる。
 * こうしておくと、複数のウィジェットを積んでも 1 枚のサイドバーとして
 * 揃って見える（各ウィジェットが自前の幅を持っていると段差ができる）。
 *
 * 本文との境目にはリサイズハンドルを重ねてあり、掴んで動かすと枠の幅が
 * 変わる（本文の行長を変える `ContentResizer` との違いは `slotWidth.ts`）。
 */
export function WidgetSlot({
  side,
  widgets,
  width,
  render,
  onWidthChange,
  onWidthCommit,
}: WidgetSlotProps) {
  const rendered = widgets
    .map((id) => ({ id, node: render(id) }))
    .filter((w) => w.node !== null && w.node !== false);

  if (rendered.length === 0) return null;

  return (
    <div
      className={styles.slot}
      data-side={side}
      data-testid={`widget-slot-${side}`}
      style={{ width: `${width}px` }}
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
      <SlotResizer
        side={side}
        width={width}
        onWidthChange={onWidthChange}
        onWidthCommit={onWidthCommit}
      />
    </div>
  );
}

interface SlotResizerProps {
  side: SlotId;
  width: number;
  onWidthChange: (side: SlotId, width: number) => void;
  onWidthCommit: (side: SlotId, width: number) => void;
}

/**
 * 枠の内側の境界（左枠なら右端 / 右枠なら左端）に重ねる幅リサイズハンドル。
 *
 * 枠の幅は親が持つ state なので、ドラッグ開始時の幅を ref に控えて
 * 「開始幅 + 移動量」で毎回作り直す（途中の更新が積み重ならない）。
 * ポインタ操作は setPointerCapture でハンドル外へ出ても追従させ、
 * キーボード（←/→）でも同じ操作ができるようにしている。
 */
function SlotResizer({
  side,
  width,
  onWidthChange,
  onWidthCommit,
}: SlotResizerProps) {
  const startRef = useRef({ x: 0, width: 0 });
  const latestRef = useRef(width);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startRef.current = { x: e.clientX, width };
      latestRef.current = width;
      setDragging(true);
      // jsdom には未実装のため任意呼び出しにする
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [width],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const next = nextSlotWidth({
        startWidth: startRef.current.width,
        deltaX: e.clientX - startRef.current.x,
        side,
      });
      latestRef.current = next;
      onWidthChange(side, next);
    },
    [dragging, onWidthChange, side],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      setDragging(false);
      onWidthCommit(side, latestRef.current);
    },
    [dragging, onWidthCommit, side],
  );

  const reset = useCallback(() => {
    onWidthCommit(side, DEFAULT_SLOT_WIDTHS[side]);
  }, [onWidthCommit, side]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Home') {
        e.preventDefault();
        reset();
        return;
      }
      const deltaX =
        e.key === 'ArrowRight'
          ? SLOT_WIDTH_STEP
          : e.key === 'ArrowLeft'
            ? -SLOT_WIDTH_STEP
            : 0;
      if (deltaX === 0) return;
      e.preventDefault();
      // キー操作は 1 打鍵ごとに完結する（変更してそのまま確定）
      onWidthCommit(side, nextSlotWidth({ startWidth: width, deltaX, side }));
    },
    [onWidthCommit, reset, side, width],
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: separator は button では表現できない
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`${side === 'left' ? '左' : '右'}の枠の幅を変更（ドラッグまたは左右キー、ダブルクリックでリセット）`}
      aria-valuenow={width}
      aria-valuemin={MIN_SLOT_WIDTH}
      aria-valuemax={MAX_SLOT_WIDTH}
      aria-valuetext={`${width}px`}
      tabIndex={0}
      className={styles.resizer}
      data-testid={`widget-slot-resizer-${side}`}
      data-dragging={String(dragging)}
      title="ドラッグで枠の幅を変更（ダブルクリックでリセット）"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={reset}
      onKeyDown={handleKeyDown}
    />
  );
}
