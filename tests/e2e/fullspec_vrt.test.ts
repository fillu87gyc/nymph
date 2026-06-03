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
 * - ls/le は fullspec.md の行番号に対応（変更時は要更新）
 *   L3   intro paragraph ← selection コメント（安定）
 *   L7   TypeScript code block (〜L17)
 *   L32  Feature Table (〜L38) ← クリックしてハイライト対象
 *   L42  Mermaid Diagram (〜L50)
 *   L70  Modified Section paragraph (〜L71) ← 変更対象 + 孤立 selection コメント
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

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
      ls: 3,
      le: 3,
      block_type: 'paragraph',
      context: 'Introductory paragraph with **bold text**',
      text: '書式設定の確認: 太字・斜体・インラインコードが正しく表示されている',
    },
    {
      id: 2,
      ls: 7,
      le: 17,
      block_type: 'code',
      context: { lang: 'typescript', code: 'interface User {\n  id: number;' },
      text: 'TypeScriptコードブロック: User インターフェースと createUser 関数',
    },
    {
      id: 3,
      ls: 32,
      le: 38,
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
      ls: 42,
      le: 50,
      block_type: 'mermaid',
      context: { lang: 'mermaid', code: 'graph TD\n  A[Open nymph]' },
      text: 'Mermaid フロー図: チェックポイントと diff の分岐フロー',
    },
    {
      id: 5,
      ls: 70,
      le: 71,
      block_type: 'paragraph',
      context: 'This line remains unchanged in the document.',
      text: '変更セクション: この段落が diff ビューでハイライトされる予定',
    },
    {
      id: 6,
      ls: 3,
      le: 3,
      block_type: 'selection',
      context: 'bold text',
      text: '選択ハイライト: CSS Highlight API によるインライン書式の選択コメント',
    },
    {
      id: 7,
      ls: 70,
      le: 71,
      block_type: 'selection',
      context: ORIGINAL_LINE,
      text: '孤立コメント: diff で変更された行への選択コメント — 削除済みバッジ確認',
    },
  ],
  null,
  2,
);

test.describe('フルスペック VRT', () => {
  test.beforeEach(async ({ fixturePath, commentsPath }) => {
    writeFileSync(fixturePath, FULLSPEC, 'utf-8');
    writeFileSync(commentsPath, PRESEEDED_COMMENTS, 'utf-8');
  });

  test.afterEach(async ({ fixturePath, commentsPath }) => {
    writeFileSync(fixturePath, ORIGINAL, 'utf-8');
    try {
      rmSync(commentsPath);
    } catch {
      /* ignore */
    }
  });

  test('全要素（コード・Mermaid・コメント複数・テーブルハイライト・selection・孤立コメント）縦長 VRT', async ({
    page,
    fixturePath,
  }) => {
    // 縦長の全要素スナップショットが収まる幅に設定
    await page.setViewportSize({ width: 1600, height: 900 });

    // ── 1. ページ読み込み ──────────────────────────────────────────
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

    // ── 2. チェックポイント設定 ──────────────────────────────────
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

    // ── 5. 縦長キャプチャのためレイアウトを展開 ──────────────────
    // #main は flex:1 の scroll container。fullPage:true + window scroll では
    // #main 内部のコンテンツが viewport 分しか撮影されないため、
    // viewport 自体をドキュメント全高さに拡張して単一フレームで撮影する。
    await page.evaluate(() => {
      const app = document.getElementById('app') as HTMLElement;
      const main = document.getElementById('main') as HTMLElement;
      if (!main || !app) return;
      const h = main.scrollHeight; // コンテンツ全高さ（変更前）
      app.style.height = 'auto';
      main.style.flex = 'none'; // flex:1 (flex-basis:0) を解除
      main.style.height = `${h}px`; // スクロール不要な高さに固定
    });

    // ビューポートをドキュメント全高さに合わせて単一フレームで全体を撮影する
    const docHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await page.setViewportSize({ width: 1600, height: docHeight });

    // ── 6. VRT 安定化用 CSS を注入 ───────────────────────────────
    // アニメーションを初期フレームで停止し、トースト・接続ドットを固定表示
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-play-state: paused !important;
          transition-duration: 0ms !important;
        }
        [data-testid="connection-dot"] { opacity: 1 !important; }
        #toast { display: none !important; }
        #update-time { visibility: hidden !important; }
        /* highlighted 状態を明るいオレンジで固定表示（アニメーション無効化） */
        [data-testid="md-block"][data-highlighted="true"][data-block-type="table"] > div,
        [data-testid="md-block"][data-highlighted="true"][data-block-type="mermaid"] > div {
          animation: none !important;
          background: rgba(194, 112, 48, 0.22) !important;
          border-radius: 6px;
        }
      `,
    });

    // ── 7. テーブルコメント（3 番目）をクリックしてハイライト ───
    await page.locator('[data-testid="comment-item"]').nth(2).click();
    await expect(
      page.locator(
        '#content [data-testid="md-block"][data-ls="32"][data-highlighted="true"]',
      ),
    ).toBeVisible({ timeout: 2000 });

    // ── 8. 縦長 VRT スクリーンショット（viewport = doc 高さ → 単一フレーム）
    await expect(page).toHaveScreenshot('fullspec-vrt.png', {
      maxDiffPixels: 800,
    });
  });
});
