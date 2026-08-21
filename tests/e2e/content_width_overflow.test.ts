/**
 * 本文カラムの横スクロール（横方向のはみ出し）が起きないことの E2E。
 *
 * 本文列の左右端に重ねたリサイズハンドル（ContentResizer）は、以前は
 * ネガティブマージンで列の外へ 7px はみ出していた。左右マージンを折りたたんで
 * 本文列がスクロールコンテナの端に接する状態や、ビューポートが本文幅より狭い
 * 状態では、そのはみ出しがそのまま横スクロールになり「本文が微妙に広く、
 * 左右にスクロールできてしまう」状態を作っていた。
 *
 * 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル。
 */
import { expect, type Page, test } from './fixtures.ts';

test.describe.configure({ mode: 'parallel' });

const KEY_LEFT = 'nymph-margin-left-collapsed';
const KEY_RIGHT = 'nymph-margin-right-collapsed';
const KEY_WIDTH = 'nymph-content-width';

/** 本文のスクロールコンテナが横にスクロールできる量（0 なら不可）。 */
async function horizontalOverflow(page: Page): Promise<number> {
  return page
    .getByTestId('content-scroll')
    .evaluate((el) => el.scrollWidth - el.clientWidth);
}

/** 初回ロード前に本文幅まわりの localStorage を仕込む。 */
async function presetLayout(
  page: Page,
  preset: { left?: boolean; right?: boolean; width?: number },
): Promise<void> {
  await page.addInitScript(
    ([keyL, keyR, keyW, left, right, width]) => {
      localStorage.setItem(keyL as string, left ? '1' : '0');
      localStorage.setItem(keyR as string, right ? '1' : '0');
      if (typeof width === 'number')
        localStorage.setItem(keyW as string, String(width));
    },
    [
      KEY_LEFT,
      KEY_RIGHT,
      KEY_WIDTH,
      preset.left ?? false,
      preset.right ?? false,
      preset.width,
    ] as const,
  );
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
}

test.describe('本文の横スクロール', () => {
  test('既定の幅（本文がビューポートより狭い）では横にスクロールできない', async ({
    page,
  }) => {
    await presetLayout(page, {});
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('左右マージンを折りたたんで本文が端に接しても横にスクロールできない', async ({
    page,
  }) => {
    await presetLayout(page, { left: true, right: true });
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('片側だけ折りたたんで右ハンドルが端に来ても横にスクロールできない', async ({
    page,
  }) => {
    await presetLayout(page, { left: true, right: false });
    await expect(page.getByTestId('content-resizer-right')).toBeAttached();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('ビューポートが本文幅より狭くても横にスクロールできない', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await presetLayout(page, {});
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('手動幅がビューポートより広くても横にスクロールできない', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await presetLayout(page, { width: 1600 });
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('リサイズハンドルは本文列の内側に収まっている', async ({ page }) => {
    await presetLayout(page, {});

    const bounds = await page.evaluate(() => {
      const content = document.querySelector('#content');
      const left = document.querySelector(
        '[data-testid="content-resizer-left"]',
      );
      const right = document.querySelector(
        '[data-testid="content-resizer-right"]',
      );
      if (!content || !left || !right) throw new Error('handle not rendered');
      const c = content.getBoundingClientRect();
      const l = left.getBoundingClientRect();
      const r = right.getBoundingClientRect();
      return {
        leftInset: l.left - c.left,
        rightInset: c.right - r.right,
        leftWidth: l.width,
        rightWidth: r.width,
      };
    });

    // 列の外へはみ出さない（端ちょうどに接する）
    expect(bounds.leftInset).toBeGreaterThanOrEqual(0);
    expect(bounds.rightInset).toBeGreaterThanOrEqual(0);
    // 掴める幅は従来どおり確保されている
    expect(bounds.leftWidth).toBe(14);
    expect(bounds.rightWidth).toBe(14);
  });
});
