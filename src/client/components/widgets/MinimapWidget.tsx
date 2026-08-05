import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { commentStatus } from '../../lib/comments.ts';
import {
  buildMinimapRows,
  clampViewportBand,
  countLines,
  lineAtRatio,
  type MinimapKind,
  ratioAtLine,
} from '../../lib/minimap.ts';
import type { Comment } from '../../types.ts';
import { WidgetEmpty, WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface MinimapWidgetProps {
  source: string;
  comments: Comment[];
  orphanedIds: Set<Comment['id']>;
  /** 本文のスクロール領域。今どこを見ているかの枠をここから作る。 */
  contentScrollRef: RefObject<HTMLDivElement | null>;
  /** 差分チェックモード中か。本文とスクロール対象が変わるので枠は出さない。 */
  diffMode: boolean;
  onSelectLine: (line: number) => void;
}

/** 表示中の範囲（0〜1 の割合）。 */
interface Viewport {
  top: number;
  height: number;
}

/**
 * 図と画像は、文字数に比例した棒ではなく中央に置いた四角で表す。
 * 中身が絵なので「何文字あるか」に意味がなく、alt や図の定義の長さで
 * 棒が伸び縮みしても読み手には何も伝わらないため。
 */
const BLOCK_KINDS = new Set<MinimapKind>(['diagram', 'image']);
/** その四角の幅（棒の箱に対する %）。 */
const BLOCK_WIDTH = 56;

/**
 * ミニマップウィジェット。
 *
 * 文書全体を縦 1 本に潰して俯瞰する。ピクセル忠実な縮小ではなく、1 行を
 * 1 本の棒（種別で色、長さで文字数）にした疑似ミニマップ（`lib/minimap.ts`）
 * で、そこにコメントの位置を点で重ねる——どこに指摘が集まっているかが
 * ひと目で分かるのが nymph でのミニマップの主目的。
 *
 * クリックするとその位置の行へ飛び、本文をスクロールすると今見ている範囲が
 * 枠で追従する。
 */
export function MinimapWidget({
  source,
  comments,
  orphanedIds,
  contentScrollRef,
  diffMode,
  onSelectLine,
}: MinimapWidgetProps) {
  const rows = useMemo(() => buildMinimapRows(source), [source]);
  const totalLines = useMemo(() => countLines(source), [source]);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const rowsRef = useRef<HTMLSpanElement>(null);

  // 本文のスクロール位置は React の外にある状態なので、購読して読み出す
  // （本文が差し替わる・モードが変わるとスクロール要素ごと変わるため依存に含める）。
  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el || diffMode) {
      setViewport(null);
      return;
    }
    function update() {
      const target = contentScrollRef.current;
      if (!target) return;
      const height = target.scrollHeight || 1;
      // 枠は棒の箱に対して置くので、下限の高さも箱の実寸で判断する。
      const box = rowsRef.current?.getBoundingClientRect().height ?? 0;
      setViewport(
        clampViewportBand(
          target.scrollTop / height,
          Math.min(1, target.clientHeight / height),
          box,
        ),
      );
    }
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [contentScrollRef, diffMode, source]);

  // 本文の行に紐づくコメントだけを点にする（差分へのコメントは行が別軸）。
  const markers = useMemo(
    () =>
      comments
        .filter((c) => c.block_type !== 'diff')
        .map((c) => ({
          id: c.id,
          ratio: ratioAtLine(c.lineStart, totalLines),
          resolved: commentStatus(c, orphanedIds.has(c.id)) !== 'open',
        })),
    [comments, orphanedIds, totalLines],
  );

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    // 位置の基準は棒の箱（枠の下の余白を押しても最終行に丸まる）。
    const rect = (rowsRef.current ?? e.currentTarget).getBoundingClientRect();
    if (rect.height === 0) return;
    onSelectLine(lineAtRatio((e.clientY - rect.top) / rect.height, totalLines));
  }

  return (
    <WidgetPanel
      title="ミニマップ"
      testId="minimap-widget"
      meta={totalLines > 0 ? `${totalLines}行` : undefined}
    >
      {rows.length === 0 ? (
        <WidgetEmpty>本文がありません</WidgetEmpty>
      ) : (
        <button
          type="button"
          className={styles.minimap}
          data-testid="minimap-canvas"
          aria-label="文書全体。クリックした位置の行へ移動します"
          onClick={handleClick}
        >
          {/* 棒・今見ている範囲・コメントの点は同じ箱を基準に置く。棒は 1 本
              あたりの高さに上限があるため、短い文書では箱が枠いっぱいには
              広がらない——外側の枠を基準にすると位置がずれる。 */}
          <span
            ref={rowsRef}
            className={styles.minimapRows}
            data-testid="minimap-rows"
          >
            {rows.map((r) => (
              <span
                key={r.line}
                className={styles.minimapRow}
                data-kind={r.kind}
                data-line={r.line}
                style={{
                  width: BLOCK_KINDS.has(r.kind)
                    ? `${BLOCK_WIDTH}%`
                    : `${Math.max(4, r.weight * 100)}%`,
                }}
              />
            ))}
            {viewport && (
              <span
                className={styles.viewport}
                data-testid="minimap-viewport"
                style={{
                  top: `${viewport.top * 100}%`,
                  height: `${viewport.height * 100}%`,
                }}
              />
            )}
            {markers.map((m) => (
              <span
                key={String(m.id)}
                className={styles.marker}
                data-testid="minimap-marker"
                data-resolved={String(m.resolved)}
                style={{ top: `${m.ratio * 100}%` }}
              />
            ))}
          </span>
        </button>
      )}
    </WidgetPanel>
  );
}
