/** 本文（#content）の左右マージン折りたたみ状態から最大幅を決める。 */
export interface MarginCollapse {
  left: boolean;
  right: boolean;
}

const DEFAULT_MAX = '960px';
const SINGLE_COLLAPSED_MAX = '1280px';
const BOTH_COLLAPSED_MAX = '1600px';

export function contentMaxWidth({ left, right }: MarginCollapse): string {
  if (left && right) return BOTH_COLLAPSED_MAX;
  if (left || right) return SINGLE_COLLAPSED_MAX;
  return DEFAULT_MAX;
}

const STORAGE_KEY_LEFT = 'nymph-margin-left-collapsed';
const STORAGE_KEY_RIGHT = 'nymph-margin-right-collapsed';

export function loadMarginCollapse(): MarginCollapse {
  return {
    left: localStorage.getItem(STORAGE_KEY_LEFT) === '1',
    right: localStorage.getItem(STORAGE_KEY_RIGHT) === '1',
  };
}

export function saveMarginCollapse(state: MarginCollapse): void {
  localStorage.setItem(STORAGE_KEY_LEFT, state.left ? '1' : '0');
  localStorage.setItem(STORAGE_KEY_RIGHT, state.right ? '1' : '0');
}

/* ── ドラッグによる本文幅の手動指定 ──────────────────────────────
 * 折りたたみトグルは 960/1280/1600px の 3 段階プリセットしか選べない。
 * 本文列の左右端に置いたハンドル（ContentResizer）をドラッグすると、
 * その間の任意の幅を px 単位で指定できる。手動幅が設定されている間は
 * プリセットより優先され、リセットするとプリセットに戻る。
 */

/** 手動幅の下限。これより狭いと本文の行長が短くなりすぎて読めない。 */
export const MIN_CONTENT_WIDTH = 400;

/** キーボード（←/→）でハンドルを動かしたときの 1 ステップ幅（px）。 */
export const CONTENT_WIDTH_STEP = 16;

const STORAGE_KEY_WIDTH = 'nymph-content-width';

export function loadContentWidth(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY_WIDTH);
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_CONTENT_WIDTH) return null;
  return Math.round(n);
}

/** null を渡すと手動幅を破棄してプリセット（contentMaxWidth）へ戻す。 */
export function saveContentWidth(width: number | null): void {
  if (width === null) {
    localStorage.removeItem(STORAGE_KEY_WIDTH);
    return;
  }
  localStorage.setItem(STORAGE_KEY_WIDTH, String(Math.round(width)));
}

/** 現在の指定幅（px）。手動幅があればそちら、なければプリセット値。 */
export function resolveContentWidthPx(
  collapse: MarginCollapse,
  manualWidth: number | null,
): number {
  if (manualWidth !== null) return Math.round(manualWidth);
  return Number.parseInt(contentMaxWidth(collapse), 10);
}

/** grid の --content-max に流す値。手動幅があればそちらが勝つ。 */
export function resolveContentMax(
  collapse: MarginCollapse,
  manualWidth: number | null,
): string {
  return `${resolveContentWidthPx(collapse, manualWidth)}px`;
}

/**
 * どちら側のリサイズハンドルを出すか。
 *
 * ガターが 0 の側は本文列がコンテナ端に貼り付いており、その端をドラッグしても
 * 幅は動かせない（動かせるのは反対側の端だけ）ため、そちら側は出さない。
 * 左右とも折りたたみのときは本文列が左端に寄るので右ハンドルだけを出す。
 */
export function resizeHandleSides(collapse: MarginCollapse): {
  left: boolean;
  right: boolean;
} {
  return {
    left: !collapse.left,
    right: !collapse.right || collapse.left,
  };
}

/**
 * ハンドルの移動量に対する幅の変化倍率。
 *
 * 左右ガターがどちらも 1fr のときは本文列が中央寄せなので、片側の端を
 * dx 動かすと反対側も対称に動き、幅は 2·dx 変わる。片側でも折りたたまれて
 * いれば本文列は端に固定されるため 1:1 になる。
 */
export function contentDragFactor(collapse: MarginCollapse): 1 | 2 {
  return !collapse.left && !collapse.right ? 2 : 1;
}

export interface NextContentWidthParams {
  /** ドラッグ開始時点の本文列の実幅（px） */
  startWidth: number;
  /** ドラッグ開始位置からのカーソル移動量（px, 右が正） */
  deltaX: number;
  side: 'left' | 'right';
  factor: 1 | 2;
  /** 本文列が取りうる最大幅（px, 通常はスクロールコンテナの内寸） */
  maxWidth: number;
}

/** ドラッグ後の本文幅を MIN_CONTENT_WIDTH〜maxWidth にクランプして返す。 */
export function nextContentWidth({
  startWidth,
  deltaX,
  side,
  factor,
  maxWidth,
}: NextContentWidthParams): number {
  const direction = side === 'right' ? 1 : -1;
  const raw = startWidth + direction * factor * deltaX;
  const upper = Math.max(MIN_CONTENT_WIDTH, maxWidth);
  return Math.round(Math.min(upper, Math.max(MIN_CONTENT_WIDTH, raw)));
}
