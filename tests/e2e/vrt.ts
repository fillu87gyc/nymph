/**
 * VRT 安定化の共通ヘルパー
 *
 * VRT フレークの根本原因は CDN 配信フォント（Google Fonts, display=swap）の
 * 読込タイミング非決定性。フォールバックフォントのまま撮影されたり、
 * mermaid がフォント確定前にテキストを計測してダイアグラム寸法が揺れる。
 *
 * 対策:
 *   1. routeVrtAssets  — 外部 CDN へのリクエストをリポジトリ内のベンダリング
 *      済みコピー（tests/e2e/assets/）で返し、その他の外部ホストは遮断する。
 *      ネットワーク状態・CDN 側のフォント更新に依存しない密閉的なレンダリング
 *      になり、ベースライン生成時と検証時で必ず同じ資産が使われる。
 *   2. stabilizeVrt — 全 stylesheet の適用と対象フォントのロード完了を待って
 *      から、アニメーション停止等の安定化 CSS を注入する。
 *      スクリーンショットやレイアウト計測（文書高さの取得など）は必ず
 *      この後に行うこと。フォントスワップ前に高さを測ると寸法自体がズレる。
 */
import { join } from 'node:path';
import type { Page } from './fixtures.ts';

const ASSETS_DIR = join(process.cwd(), 'tests/e2e/assets');
const HLJS_STYLES_DIR = join(process.cwd(), 'node_modules/highlight.js/styles');

/**
 * index.html + アプリが利用する Web フォント（ベンダリング済みセット）。
 * フォントを追加したら tests/e2e/assets/ の再生成とこのリストの更新が必要。
 */
export const VRT_FONT_SPECS = [
  '300 16px "DM Sans"',
  '16px "DM Sans"',
  '500 16px "DM Sans"',
  '600 16px "DM Sans"',
  '16px Lora',
  '500 16px Lora',
  'italic 16px Lora',
  '700 16px "Playfair Display"',
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
  /* 更新時刻はプロポーショナル数字で文字幅が毎回変わり、visibility:hidden
     では幅が残ってツールバー全体が横にズレるため、レイアウトごと除去する */
  #update-time { display: none !important; }
  [data-testid="brand-version"] { visibility: hidden !important; }
`;

/**
 * 外部 CDN 資産をベンダリング済みコピーで返す。page.goto() より前に呼ぶこと。
 * 想定外の外部リクエストは abort されるため、新たな外部依存が入り込むと
 * テストが（ピクセル差分ではなく）明確に失敗して顕在化する。
 */
export async function routeVrtAssets(page: Page): Promise<void> {
  // 後に登録した route が優先されるため、遮断のキャッチオールを最初に登録する
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({
      path: join(ASSETS_DIR, 'google-fonts.css'),
      contentType: 'text/css',
    }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    return route.fulfill({
      path: join(ASSETS_DIR, 'fonts', name),
      contentType: 'font/woff2',
    });
  });
  // hljs テーマ CSS は lockfile 固定の node_modules コピーで返す
  await page.route(
    'https://cdn.jsdelivr.net/npm/highlight.js@*/**',
    (route) => {
      const file = new URL(route.request().url()).pathname.split('/styles/')[1];
      return route.fulfill({
        path: join(HLJS_STYLES_DIR, file),
        contentType: 'text/css',
      });
    },
  );
}

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
