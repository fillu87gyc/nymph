/**
 * フルスペック VRT
 *
 * コードブロック・Mermaid・複数コメント・テーブルの選択ハイライト・
 * selection コメント（CSS Highlight API）・孤立コメント（削除済みバッジ）を
 * 含む 1 画面を縦長スクリーンショットで比較する。
 *
 * diff 表示の見た目検証は責務過多を避けるため diff_vrt.test.ts に分離した。
 * ここではファイルを変更して「孤立コメント（削除済みバッジ）」を出すが、
 * diff モードは ON にしない。
 *
 * - lineStart/lineEnd は fullspec.md の行番号に対応（変更時は要更新）
 *   L3   intro paragraph ← selection コメント（安定）
 *   L7   TypeScript code block (〜L17)
 *   L32  Feature Table (〜L38) ← クリックしてハイライト対象
 *   L42  Mermaid Diagram (〜L50)
 *   L70  Modified Section paragraph (〜L71) ← 変更対象 + 孤立 selection コメント
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, openOverflowMenu, test } from './fixtures.ts';
import { stabilizeVrt } from './vrt.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

const FULLSPEC_PATH = join(process.cwd(), 'tests/fixtures/fullspec.md');
const FULLSPEC = readFileSync(FULLSPEC_PATH, 'utf-8');

const ORIGINAL_LINE =
  'This specific line will be modified to trigger the diff view highlight.';
const CHANGED_LINE =
  'This specific line has been modified to demonstrate the diff highlight feature.';
const FULLSPEC_MODIFIED = FULLSPEC.replace(ORIGINAL_LINE, CHANGED_LINE);

const PRESEEDED_COMMENTS = JSON.stringify(
  [
    {
      id: 1,
      lineStart: 3,
      lineEnd: 3,
      block_type: 'paragraph',
      context: 'Introductory paragraph with **bold text**',
      text: '書式設定の確認: 太字・斜体・インラインコードが正しく表示されている',
    },
    {
      id: 2,
      lineStart: 7,
      lineEnd: 17,
      block_type: 'code',
      context: { lang: 'typescript', code: 'interface User {\n  id: number;' },
      text: 'TypeScriptコードブロック: User インターフェースと createUser 関数',
    },
    {
      id: 3,
      lineStart: 32,
      lineEnd: 38,
      block_type: 'table',
      context: {
        headers: ['Feature', 'Status', 'Notes'],
        rows: [
          {
            Feature: 'Code highlighting',
            Status: '✅',
            Notes: 'Powered by highlight.js',
          },
        ],
      },
      text: '機能テーブル: 全機能がサポート済み ✅ — このコメントがハイライト対象',
    },
    {
      id: 4,
      lineStart: 42,
      lineEnd: 50,
      block_type: 'mermaid',
      context: { lang: 'mermaid', code: 'graph TD\n  A[Open nymph]' },
      text: 'Mermaid フロー図: チェックポイントと diff の分岐フロー',
    },
    {
      id: 5,
      lineStart: 70,
      lineEnd: 71,
      block_type: 'paragraph',
      context: 'This line remains unchanged in the document.',
      text: '変更セクション: この段落が diff ビューでハイライトされる予定',
    },
    {
      id: 6,
      lineStart: 3,
      lineEnd: 3,
      block_type: 'selection',
      context: 'bold text',
      text: '選択ハイライト: CSS Highlight API によるインライン書式の選択コメント',
    },
    {
      id: 7,
      lineStart: 70,
      lineEnd: 71,
      block_type: 'selection',
      context: ORIGINAL_LINE,
      text: '孤立コメント: diff で変更された行への選択コメント — 削除済みバッジ確認',
    },
  ],
  null,
  2,
);

test.describe('フルスペック VRT', () => {
  test.beforeEach(async ({ fixturePath, commentsPath, reviewDir }) => {
    // 新store（前回実行分の checkpoint/comments）が残っていると、レガシー
    // シードより新store側が優先されてしまう（リトライ時に顕在化する）ため、
    // 毎回ここで掃除してからレガシーへシードし、自動移行で拾わせる。
    rmSync(reviewDir, { recursive: true, force: true });
    writeFileSync(fixturePath, FULLSPEC, 'utf-8');
    writeFileSync(commentsPath, PRESEEDED_COMMENTS, 'utf-8');
  });

  test.afterEach(async ({ fixturePath, commentsPath, reviewDir }) => {
    writeFileSync(fixturePath, ORIGINAL, 'utf-8');
    try {
      rmSync(commentsPath);
    } catch {
      /* ignore */
    }
    rmSync(reviewDir, { recursive: true, force: true });
  });

  test('全要素（コード・Mermaid・コメント複数・テーブルハイライト・selection・孤立コメント）縦長 VRT', async ({
    page,
    fixturePath,
  }) => {
    // 縦長の全要素スナップショットが収まる幅に設定
    await page.setViewportSize({ width: 1600, height: 900 });

    // ── 1. ページ読み込み ──────────────────────────────────────────
    // 外部 CDN 資産は fixtures.ts の routeStaticAssets がベンダリング済み
    // コピーで返すため、レンダリングはネットワーク状態に依存しない
    await page.goto('/');
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 10000,
    });

    // Mermaid SVG の描画完了を待つ（hljs もここで完了する）
    await expect(page.locator('#content .mermaid svg')).toBeVisible({
      timeout: 15000,
    });

    // ── 2. チェックポイント設定（⋯ メニューの中） ──────────────────
    // 後続の #btn-comments クリックがオーバーフローメニュー外へのクリックと
    // なり自動的に閉じるため、最終スクリーンショットにメニューは映り込まない。
    await openOverflowMenu(page);
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
      {
        timeout: 5000,
      },
    );

    // ── 3. ファイルを変更（孤立コメントの削除済みバッジを発生させる） ──
    //   diff モードは ON にしない（diff の見た目検証は diff_vrt.test.ts）。
    writeFileSync(fixturePath, FULLSPEC_MODIFIED, 'utf-8');
    await expect(page.locator('#content')).toContainText(CHANGED_LINE, {
      timeout: 8000,
    });

    // ── 4. コメントパネルを開く ────────────────────────────────────
    await page.locator('#btn-comments').click();
    await expect(page.locator('#comments-panel[data-open="true"]')).toBeVisible(
      {
        timeout: 3000,
      },
    );
    // 7 件のコメントがすべてレンダリングされるまで待機
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(7, {
      timeout: 5000,
    });
    // ORIGINAL_LINE への selection コメントが孤立して「削除済み」バッジが表示されているか確認
    await expect(page.locator('[data-testid="c-deleted"]').first()).toBeVisible(
      {
        timeout: 3000,
      },
    );

    // ── 5. VRT 安定化（フォント確定 + 安定化 CSS 注入） ─────────────
    // 高さ計測より前にフォントを確定させる。フォントスワップ後に文書高さが
    // 変わると、スクリーンショットの寸法自体がベースラインとズレるため。
    await stabilizeVrt(
      page,
      `
        /* highlighted 状態を明るいオレンジで固定表示（アニメーション無効化） */
        [data-testid="md-block"][data-highlighted="true"][data-block-type="table"] > div,
        [data-testid="md-block"][data-highlighted="true"][data-block-type="mermaid"] > div {
          animation: none !important;
          background: rgba(194, 112, 48, 0.22) !important;
          border-radius: 6px;
        }
      `,
    );

    // ── 6. 縦長キャプチャのためレイアウトを展開 ──────────────────
    // 実際のスクロールコンテナは #main ではなく内側の
    // [data-testid="content-scroll"]（.contentGrid, overflow-y:auto）。
    // fullPage:true + window scroll では内部コンテンツが viewport 分しか
    // 撮影されないため、コンテナの全コンテンツ高さに合わせて #main を固定し、
    // viewport 自体をドキュメント全高さに拡張して単一フレームで撮影する。
    await page.evaluate(() => {
      const app = document.getElementById('app') as HTMLElement;
      const main = document.getElementById('main') as HTMLElement;
      const scroll = document.querySelector<HTMLElement>(
        '[data-testid="content-scroll"]',
      );
      if (!main || !app || !scroll) return;
      const h = scroll.scrollHeight; // コンテンツ全高さ
      app.style.height = 'auto';
      main.style.flex = 'none'; // flex:1 (flex-basis:0) を解除
      main.style.height = `${h}px`; // スクロール不要な高さに固定
      main.style.overflow = 'visible'; // .mainRow の overflow:hidden を解除
      scroll.style.overflowY = 'visible'; // スクロールコンテナを解除
      scroll.scrollTop = 0; // 途中スクロール状態を持ち込まない

      // コメントパネル（高さ固定 210px・内部スクロール）も全件見えるよう
      // 展開し、7 件のコメントと削除済みバッジを撮影対象に含める
      const panel = document.getElementById('comments-panel');
      const list = document.getElementById('comments-list');
      if (panel && list) {
        panel.style.height = 'auto';
        list.style.overflowY = 'visible';
      }
    });

    // ビューポートをドキュメント全高さに合わせて単一フレームで全体を撮影する
    const docHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await page.setViewportSize({ width: 1600, height: docHeight });

    // ── 7. テーブルコメント（3 番目）をクリックしてハイライト ───
    await page.locator('[data-testid="comment-item"]').nth(2).click();
    await expect(
      page.locator(
        '#content [data-testid="md-block"][data-line-start="32"][data-highlighted="true"]',
      ),
    ).toBeVisible({ timeout: 2000 });

    // ── 8. 縦長 VRT スクリーンショット（viewport = doc 高さ → 単一フレーム）
    await expect(page).toHaveScreenshot('fullspec-vrt.png', {
      maxDiffPixels: 800,
    });
  });
});
