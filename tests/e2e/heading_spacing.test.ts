/**
 * 見出しの上下マージン E2E
 *
 * 見出しも本文段落と同じ 1 ブロック（.block, margin-bottom: 1.35em ≒ 18.9px）
 * として描画されるため、見出し側で余白を指定しないと章の切れ目が本文の行間と
 * 区別できない。ここでは「見出しの前後の空きが通常ブロック間より広いこと」を
 * 実測して保証する。
 *
 * 読み取り専用（ファイルを書き換えない）テスト。
 */
import { expect, type Page, test } from './fixtures.ts';

/** ブロック間の空き（px）。前ブロックの下端から次ブロックの上端まで。 */
async function gapBetween(
  page: Page,
  upperIndex: number,
  lowerIndex: number,
): Promise<number> {
  const blocks = page.locator('#content [data-testid="md-block"]');
  const upper = await blocks.nth(upperIndex).boundingBox();
  const lower = await blocks.nth(lowerIndex).boundingBox();
  if (!upper || !lower) throw new Error('block not found');
  return lower.y - (upper.y + upper.height);
}

/** 見出しを含まない通常ブロック同士の空き（比較の基準）。 */
const BASE_BLOCK_GAP = 18.9; // 1.35em @ 14px

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

// sample.md のブロック構成:
//   0: h1 Sample / 1: 段落 / 2: テーブル / 3: h2 Section
//   4: 段落 / 5: コードブロック / 6: h2 Diagram / 7: mermaid
test.describe('見出しの上下マージン', () => {
  test('見出しの上は通常のブロック間より広く空く', async ({ page }) => {
    const above = await gapBetween(page, 2, 3); // テーブル → h2 Section
    expect(above).toBeGreaterThan(BASE_BLOCK_GAP * 1.5);
  });

  test('見出しの下も通常のブロック間より広く空く', async ({ page }) => {
    const below = await gapBetween(page, 3, 4); // h2 Section → 段落
    expect(below).toBeGreaterThan(BASE_BLOCK_GAP);
  });

  test('見出しの上は下より広い（見出しが直後の本文に結び付いて見える）', async ({
    page,
  }) => {
    const above = await gapBetween(page, 2, 3);
    const below = await gapBetween(page, 3, 4);
    expect(above).toBeGreaterThan(below);
  });

  test('見出しを挟まない通常ブロック間の余白は変わらない', async ({ page }) => {
    const gap = await gapBetween(page, 1, 2); // 段落 → テーブル
    expect(gap).toBeCloseTo(BASE_BLOCK_GAP, 0);
  });

  test('文書先頭の見出しには上マージンが付かない（#content の padding のみ）', async ({
    page,
  }) => {
    const content = await page.locator('#content').boundingBox();
    const firstBlock = await page
      .locator('#content [data-testid="md-block"]')
      .first()
      .boundingBox();
    if (!content || !firstBlock) throw new Error('layout not measurable');
    expect(firstBlock.y - content.y).toBeCloseTo(48, 0); // padding-top: 48px
  });

  test('本文フォントを変えても見出しの余白は保たれる（rem 指定）', async ({
    page,
  }) => {
    const before = await gapBetween(page, 2, 3);
    await page.getByTestId('settings-menu-btn').click();
    await page.getByTestId('content-font-select').selectOption('default');
    await page.keyboard.press('Escape');
    expect(await gapBetween(page, 2, 3)).toBeCloseTo(before, 0);
  });
});
