/**
 * VRT 安定化の共通ヘルパー
 *
 * VRT フレークの根本原因は CDN 配信フォント（Google Fonts, display=swap）の
 * 読込タイミング非決定性。フォールバックフォントのまま撮影されたり、
 * mermaid がフォント確定前にテキストを計測してダイアグラム寸法が揺れる。
 *
 * 前提: 外部 CDN 資産はベンダリング済みコピーで返される（fixtures.ts の
 * routeStaticAssets が全 E2E コンテキストに適用済み）。その上で本モジュールの
 * stabilizeVrt が「全 stylesheet の適用と対象フォントのロード完了」を待って
 * から安定化 CSS を注入する。スクリーンショットやレイアウト計測（文書高さの
 * 取得など）は必ずこの後に行うこと。フォントスワップ前に高さを測ると
 * 寸法自体がズレる。
 */
import type { Page } from './fixtures.ts';

/**
 * index.html + アプリが利用する Web フォント（ベンダリング済みセット）。
 * フォントを追加したら tests/e2e/assets/ の再生成とこのリストの更新が必要。
 */
export const VRT_FONT_SPECS = [
  '300 16px "DM Sans"',
  '16px "DM Sans"',
  '500 16px "DM Sans"',
  '600 16px "DM Sans"',
  '16px "Inter"',
  '500 16px "Inter"',
  '700 16px "Inter"',
  'italic 16px "Inter"',
  '16px "JetBrains Mono"',
  '500 16px "JetBrains Mono"',
] as const;

/** アニメーション・可変表示（時刻等）を固定する安定化 CSS */
export const VRT_STABILIZE_CSS = `
  *, *::before, *::after {
    animation-play-state: paused !important;
    /* transition-duration: 0ms は進行中のトランジションをキャンセルしないが、
       transition-property の変更（= transition: none）は仕様上、実行中の
       トランジションを即キャンセルして最終値にジャンプさせる。
       コメントパネルの height 遷移（0.2s）中に文書高さを計測すると
       スクリーンショット寸法自体が揺れるため、こちらを使う。 */
    transition: none !important;
  }
  [data-testid="connection-dot"] { opacity: 1 !important; }
  #toast { display: none !important; }
  /* 更新時刻は接続ドットの title 属性に統合され、ホバー時のみ表示される
     ネイティブツールチップのためレイアウト・スクリーンショットに影響しない */
  [data-testid="brand-version"] { visibility: hidden !important; }
`;

/**
 * 全 stylesheet の適用と VRT_FONT_SPECS のロード完了を待ち、
 * 安定化 CSS（+ テスト固有の extraCss）を注入する。
 * 文書高さの計測やスクリーンショットは必ずこの呼び出しの後で行う。
 */
export async function stabilizeVrt(page: Page, extraCss = ''): Promise<void> {
  await page.waitForFunction(
    async (specs) => {
      const links = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      );
      if (links.some((l) => !l.sheet)) return false;
      await Promise.all(specs.map((s) => document.fonts.load(s)));
      return specs.every((s) => document.fonts.check(s));
    },
    VRT_FONT_SPECS,
    { timeout: 15000 },
  );
  await page.addStyleTag({ content: VRT_STABILIZE_CSS + extraCss });
}
