import { useCallback, useRef, useState } from 'react';
import { CONTENT_WIDTH_STEP, MIN_CONTENT_WIDTH } from '../lib/contentWidth.ts';
import styles from './ContentResizer.module.css';

interface ContentResizerProps {
  side: 'left' | 'right';
  /** 現在の本文幅（px）。支援技術に読み上げる値。 */
  width: number;
  /** ドラッグ開始。App 側で開始時の実幅を記録する。 */
  onResizeStart: () => void;
  /** ドラッグ中。deltaX はドラッグ開始位置からの累積移動量（px, 右が正）。 */
  onResize: (side: 'left' | 'right', deltaX: number) => void;
  /** ドラッグ終了（localStorage への保存タイミング）。 */
  onResizeEnd: () => void;
  /** ダブルクリック / Home キーでプリセット幅に戻す。 */
  onReset: () => void;
}

/**
 * 本文列の左右端に重ねる幅リサイズハンドル。
 *
 * .contentGrid の 3 カラム（ガター/本文/ガター）のうち本文カラムに
 * grid-row/grid-column を明示して重ね、justify-self で端に寄せている。
 * position: sticky で縦スクロール中も常に掴める位置に留まる。
 *
 * ポインタ操作は setPointerCapture でハンドル外へ出ても追従させる。
 * キーボード（←/→）でも幅を変えられるよう role="separator" + tabIndex で
 * フォーカス可能にしている。
 */
export function ContentResizer({
  side,
  width,
  onResizeStart,
  onResize,
  onResizeEnd,
  onReset,
}: ContentResizerProps) {
  const startXRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startXRef.current = e.clientX;
      setDragging(true);
      onResizeStart();
      // jsdom には未実装のため任意呼び出しにする
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [onResizeStart],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      onResize(side, e.clientX - startXRef.current);
    },
    [dragging, onResize, side],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      setDragging(false);
      onResizeEnd();
    },
    [dragging, onResizeEnd],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Home') {
        e.preventDefault();
        onReset();
        return;
      }
      const step =
        e.key === 'ArrowRight'
          ? CONTENT_WIDTH_STEP
          : e.key === 'ArrowLeft'
            ? -CONTENT_WIDTH_STEP
            : 0;
      if (step === 0) return;
      e.preventDefault();
      // キー操作は 1 打鍵ごとに完結する（開始 → 移動 → 確定）
      onResizeStart();
      onResize(side, step);
      onResizeEnd();
    },
    [onReset, onResize, onResizeEnd, onResizeStart, side],
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: separator は button では表現できない
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="本文幅を変更（ドラッグまたは左右キー、ダブルクリックでリセット）"
      aria-valuenow={width}
      aria-valuemin={MIN_CONTENT_WIDTH}
      aria-valuetext={`${width}px`}
      tabIndex={0}
      className={`${styles.handle} ${side === 'left' ? styles.left : styles.right}`}
      data-testid={`content-resizer-${side}`}
      data-dragging={String(dragging)}
      title="ドラッグで本文幅を変更（ダブルクリックでリセット）"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  );
}
