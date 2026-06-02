/**
 * diff 右マージン表示 VRT
 *
 * git diff 風の差分表示（本文は中央のまま、削除(−)→追加(+)を右マージンに
 * 積み重ねて文字単位ハイライト）に特化した VRT。
 *
 * フルスペック VRT が「全要素を 1 枚に詰め込みすぎ」だったため、diff の見た目
 * 検証はこちらに分離している（fullspec 側は diff モードを ON にしない）。
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/sample.md');
const ORIGINAL = readFileSync(FIXTURE, 'utf-8');
const COMMENTS_FILE = `${FIXTURE}.comments.json`;

// VRT 安定化: アニメーション停止 + 可変表示（時刻・コミットハッシュ等）を隠す
const STABILIZE = `
  *, *::before, *::after {
    animation-play-state: paused !important;
    transition-duration: 0ms !important;
  }
  .connection-dot, .watch-dot { opacity: 1 !important; }
  #toast { display: none !important; }
  #update-time, .brand-version { visibility: hidden !important; }
`;

// before を読み込み → checkpoint → after に変更 → diff ON、までを行う。
// afterMarker は変更後の本文に現れる文字列。本文が SSE で再描画され切ってから
// diff を ON にすることで（本文＝変更後の表示）スクリーンショットを安定させる。
async function produceDiff(
  page: Page,
  before: string,
  after: string,
  afterMarker: string,
) {
  writeFileSync(FIXTURE, before, 'utf-8');
  await page.goto('/');
  await expect(page.locator('#content .md-block').first()).toBeVisible({
    timeout: 8000,
  });

  await page.locator('#btn-checkpoint').click();
  await expect(page.locator('#btn-checkpoint')).toHaveClass(/has-checkpoint/, {
    timeout: 5000,
  });

  writeFileSync(FIXTURE, after, 'utf-8');
  await expect(page.locator('#content')).toContainText(afterMarker, {
    timeout: 8000,
  });
  await page.locator('#btn-diff').click();
  await expect(page.locator('#btn-diff')).toHaveClass(/active/, {
    timeout: 3000,
  });
  await expect(page.locator('.diff-aside .diff-side-del')).toBeVisible({
    timeout: 5000,
  });
  await page.addStyleTag({ content: STABILIZE });
}

test.describe('diff 右マージン表示 VRT', () => {
  test.beforeEach(() => {
    try {
      rmSync(COMMENTS_FILE);
    } catch {
      /* ignore */
    }
  });

  test.afterEach(() => {
    writeFileSync(FIXTURE, ORIGINAL, 'utf-8');
    try {
      rmSync(COMMENTS_FILE);
    } catch {
      /* ignore */
    }
  });

  test('1 行の変更: 右マージンに 削除(−)→追加(+) が積み重なり、変更箇所だけハイライト', async ({
    page,
  }) => {
    // 右マージンの aside（幅 260px）が収まる幅
    await page.setViewportSize({ width: 1400, height: 360 });
    await produceDiff(
      page,
      '# Diff VRT\n\nThe quick brown fox jumps over the dog.\n',
      '# Diff VRT\n\nThe quick red fox leaps over the dog.\n',
      'leaps over',
    );
    await expect(page).toHaveScreenshot('diff-aside-single.png', {
      maxDiffPixels: 800,
    });
  });

  test('複数行の変更: 箇条書きの追加でも 1 行ずつ積み重なって表示される', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 480 });
    await produceDiff(
      page,
      '# Diff VRT\n\n- ようこそ\n- ここは岐阜県です\n',
      '# Diff VRT\n\n- ようこそ\n- ここは\n- 水と山が綺麗な\n- 東海道新幹線が通る\n- 静岡県です\n',
      '東海道新幹線が通る',
    );
    // 追加 4 行がすべて描画されるまで待つ
    await expect(page.locator('.diff-side-ins .diff-ins')).toHaveCount(4, {
      timeout: 5000,
    });
    await expect(page).toHaveScreenshot('diff-aside-multiline.png', {
      maxDiffPixels: 800,
    });
  });
});
