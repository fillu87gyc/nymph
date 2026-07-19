import { expect, test } from './fixtures.ts';

// 折りたたみによる幅の増分を viewport の制約なく検証するため、ワイドな
// ビューポートを固定する（デフォルト viewport だと早期に上限に達してしまう）。
test.use({ viewport: { width: 1920, height: 1080 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.describe('本文の左右マージン折りたたみ', () => {
  test('左マージンを折りたためると本文が広がり localStorage に保存される', async ({
    page,
  }) => {
    const before = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);

    await page.locator('[data-testid="margin-toggle-left"]').click();

    const after = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBeGreaterThan(before);

    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-margin-left-collapsed'),
    );
    expect(saved).toBe('1');
  });

  test('右マージンを折りたためると本文が広がり localStorage に保存される', async ({
    page,
  }) => {
    const before = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);

    await page.locator('[data-testid="margin-toggle-right"]').click();

    const after = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBeGreaterThan(before);

    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-margin-right-collapsed'),
    );
    expect(saved).toBe('1');
  });

  test('左右両方を折りたたむと片方だけより本文がさらに広がる', async ({
    page,
  }) => {
    await page.locator('[data-testid="margin-toggle-left"]').click();
    const oneSide = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);

    await page.locator('[data-testid="margin-toggle-right"]').click();
    const bothSides = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);

    expect(bothSides).toBeGreaterThan(oneSide);
  });

  test('もう一度クリックすると元の幅に戻る', async ({ page }) => {
    const before = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);

    await page.locator('[data-testid="margin-toggle-left"]').click();
    await page.locator('[data-testid="margin-toggle-left"]').click();

    const after = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBe(before);

    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-margin-left-collapsed'),
    );
    expect(saved).toBe('0');
  });

  test('リロード後も折りたたみ状態が復元される', async ({ page }) => {
    await page.locator('[data-testid="margin-toggle-right"]').click();
    const collapsedWidth = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });

    const restoredWidth = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(restoredWidth).toBe(collapsedWidth);
  });

  test('差分チェックモードでは折りたたみボタンが表示されない', async ({
    page,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await page.locator('#btn-diff').click();
    await expect(page.locator('[data-testid="diff-view"]')).toBeVisible({
      timeout: 5000,
    });

    await expect(
      page.locator('[data-testid="margin-toggle-left"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="margin-toggle-right"]'),
    ).toHaveCount(0);
  });
});
