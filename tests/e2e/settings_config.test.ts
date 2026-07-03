import { rmSync, writeFileSync } from 'node:fs';
import { expect, test } from './fixtures.ts';

test.describe('設定ファイル（.nymph/settings.yml）による文字サイズ・本文幅の調整', () => {
  test.afterEach(({ settingsPath }) => {
    try {
      rmSync(settingsPath);
    } catch {
      /* ignore */
    }
  });

  test('設定ファイルがない場合はデフォルト値（14px / 820px）が適用される', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });

    const vars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        fontSize: style.getPropertyValue('--content-font-size').trim(),
        width: style.getPropertyValue('--content-width').trim(),
      };
    });
    expect(vars.fontSize).toBe('14px');
    expect(vars.width).toBe('820px');
  });

  test('設定ファイルの値が --content-font-size / --content-width に反映される', async ({
    page,
    settingsPath,
  }) => {
    writeFileSync(settingsPath, 'fontSize: 20\ncontentWidth: 960\n', 'utf-8');

    await page.goto('/');
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });

    const vars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        fontSize: style.getPropertyValue('--content-font-size').trim(),
        width: style.getPropertyValue('--content-width').trim(),
      };
    });
    expect(vars.fontSize).toBe('20px');
    expect(vars.width).toBe('960px');

    const contentMaxWidth = await page.evaluate(() => {
      const el = document.getElementById('content');
      return el ? getComputedStyle(el).maxWidth : null;
    });
    expect(contentMaxWidth).toBe('960px');
  });
});
