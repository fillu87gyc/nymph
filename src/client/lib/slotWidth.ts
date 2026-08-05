/**
 * ウィジェット枠（左右のサイドバー）の幅。
 *
 * 本文幅（`contentWidth.ts`）と操作が並ぶので、責務は掴む場所で分ける。
 *
 * - 枠の外側の境界（サイドバーと本文の境目）を掴む → サイドバーの幅が変わる。
 *   本文列が使える横幅が増減するだけで、本文の行長そのものは動かない。
 * - 本文列の左右端（`ContentResizer`）を掴む → 本文の行長が変わる。
 *   サイドバーには触らない。
 *
 * どちらも「掴んだ境界がカーソルについてくる」点は同じで、掴む位置が違えば
 * 変わるものも違う、という 1 本の規則で説明できるようにしている。
 *
 * 幅は他の表示設定（テーマ・本文幅・配置）と同じく localStorage に保存する。
 */

import type { SlotId } from './widgets.ts';

export interface SlotWidths {
  left: number;
  right: number;
}

/**
 * 既定幅。ウィジェット配置（第1弾）で移設する前の各パネルの値で、
 * CSS のフォールバックとも一致させている（初期表示はピクセル同一）。
 */
export const DEFAULT_SLOT_WIDTHS: SlotWidths = { left: 240, right: 220 };

/** 下限。これより狭いとツリーの行やアウトラインの見出しが読めない。 */
export const MIN_SLOT_WIDTH = 140;

/**
 * 上限。本文の最小幅（`MIN_CONTENT_WIDTH` = 400px）と合わせても
 * 1280px 級の画面に左右とも収まる値にしてある。
 */
export const MAX_SLOT_WIDTH = 480;

/** キーボード（←/→）でハンドルを動かしたときの 1 ステップ幅（px）。 */
export const SLOT_WIDTH_STEP = 16;

export const SLOT_WIDTH_STORAGE_KEY = 'nymph-slot-width';

export function clampSlotWidth(px: number): number {
  if (!Number.isFinite(px)) return MIN_SLOT_WIDTH;
  return Math.round(Math.min(MAX_SLOT_WIDTH, Math.max(MIN_SLOT_WIDTH, px)));
}

export interface NextSlotWidthParams {
  /** ドラッグ開始時点の枠の幅（px） */
  startWidth: number;
  /** ドラッグ開始位置からのカーソル移動量（px, 右が正） */
  deltaX: number;
  side: SlotId;
}

/**
 * ドラッグ後の枠幅を下限〜上限にクランプして返す。
 *
 * ハンドルは枠の内側の境界（左枠なら右端 / 右枠なら左端）に付くので、
 * 左枠は右へ動かすほど広がり、右枠は右へ動かすほど狭まる。
 * どちらも「掴んだ境界がカーソルについてくる」ように見える。
 */
export function nextSlotWidth({
  startWidth,
  deltaX,
  side,
}: NextSlotWidthParams): number {
  const direction = side === 'left' ? 1 : -1;
  return clampSlotWidth(startWidth + direction * deltaX);
}

/** 保存済み・外部由来の値を安全な SlotWidths に整える。 */
export function normalizeSlotWidths(raw: unknown): SlotWidths {
  if (typeof raw !== 'object' || raw === null)
    return { ...DEFAULT_SLOT_WIDTHS };
  const source = raw as Partial<Record<SlotId, unknown>>;
  return {
    left: pick(source.left, DEFAULT_SLOT_WIDTHS.left),
    right: pick(source.right, DEFAULT_SLOT_WIDTHS.right),
  };
}

function pick(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clampSlotWidth(value)
    : fallback;
}

export function loadSlotWidths(): SlotWidths {
  try {
    const saved = localStorage.getItem(SLOT_WIDTH_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_SLOT_WIDTHS };
    return normalizeSlotWidths(JSON.parse(saved));
  } catch {
    // 壊れた JSON / localStorage 不可の環境では既定幅に落とす
    return { ...DEFAULT_SLOT_WIDTHS };
  }
}

export function saveSlotWidths(widths: SlotWidths): void {
  try {
    localStorage.setItem(SLOT_WIDTH_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // 保存できなくても幅の変更自体は動くので握りつぶす
  }
}
