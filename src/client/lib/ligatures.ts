/**
 * リガチャ（合字）の有効 / 無効。
 *
 * 本文の serif フォントは fi / fl などの標準合字を、コードブロックや差分・
 * コメントのスニペット（JetBrains Mono）は `=>` `!=` `===` などのプログラミング
 * 合字を 1 グリフに合成して描画する。レビュー用途では「画面に見えている字面と
 * 原文の文字列が 1 対 1 で対応していないと確認しづらい」場面があるため、
 * 合字を切って 1 文字ずつ表示できるようにする。
 *
 * 適用は CSS 変数 `--ligatures` 経由。html / body が
 * `font-variant-ligatures: var(--ligatures)` を参照しており、
 * font-variant-ligatures は継承プロパティなので、本文（#content）だけでなく
 * 差分ビュー・コメントパネル・ポータル配下のモーダルまで一度に伝播する。
 *
 * 設定はブラウザ単位（localStorage）で保持する。テーマや本文フォントと同じく
 * 「その端末での見え方の好み」であってレビュー成果物ではないため。
 */

export const LIGATURES_STORAGE_KEY = 'nymph-ligatures';

/** 既定は有効（= これまでの見た目。設定を足しても既存ユーザーの表示は変わらない）。 */
const DEFAULT_ENABLED = true;

export function loadLigatures(): boolean {
  const saved = localStorage.getItem(LIGATURES_STORAGE_KEY);
  if (saved === 'on') return true;
  if (saved === 'off') return false;
  return DEFAULT_ENABLED;
}

export function saveLigatures(enabled: boolean): void {
  localStorage.setItem(LIGATURES_STORAGE_KEY, enabled ? 'on' : 'off');
}

/**
 * `--ligatures` に font-variant-ligatures の値を流す。
 * 有効時は `normal`（= このプロパティの初期値）なので、設定を触っていない
 * 状態のレンダリングは従来と完全に一致する。
 */
export function applyLigatures(enabled: boolean): void {
  document.documentElement.style.setProperty(
    '--ligatures',
    enabled ? 'normal' : 'none',
  );
}
