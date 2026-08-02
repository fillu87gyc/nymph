/**
 * 本文幅のドラッグリサイズ E2E
 *
 * 折りたたみトグル（content_width.test.ts）が 960/1280/1600px の 3 段階
 * プリセットなのに対し、こちらは本文列の左右端のハンドルをドラッグして
 * その間の任意幅を選べることを検証する。
 *
 * 書き込みを伴わない読み取り専用のテストなのでファイル復元は不要。
 * 幅の増分が viewport 上限に当たらないようワイドな viewport を固定する。
 */
import { expect, openSettingsMenu, type Page, test } from './fixtures.ts';

// 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル
// なので、1 ワーカーに固定せず全テストを worker プール全体に分散させる
// （各テストは _workerServer 経由で独立したサーバー/ポートを持つため安全）。
test.describe.configure({ mode: 'parallel' });

test.use({ viewport: { width: 1920, height: 1080 } });

const STORAGE_KEY = 'nymph-content-width';

async function contentWidth(page: Page): Promise<number> {
  return page
    .locator('#content')
    .evaluate((el) => el.getBoundingClientRect().width);
}

async function savedWidth(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
}

/** ハンドルの中心を掴んで dx だけ水平にドラッグする。 */
async function dragHandle(
  page: Page,
  side: 'left' | 'right',
  dx: number,
): Promise<void> {
  const handle = page.getByTestId(`content-resizer-${side}`);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`resize handle not found: ${side}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // 途中経過を挟むことで pointermove が確実に発火する
  await page.mouse.move(x + dx / 2, y);
  await page.mouse.move(x + dx, y);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.describe('本文幅のドラッグリサイズ', () => {
  test('左右とも展開時は両側にハンドルが出る', async ({ page }) => {
    await expect(page.getByTestId('content-resizer-left')).toBeAttached();
    await expect(page.getByTestId('content-resizer-right')).toBeAttached();
  });

  test('右ハンドルを外側へドラッグすると本文が広がり localStorage に保存される', async ({
    page,
  }) => {
    const before = await contentWidth(page);
    expect(await savedWidth(page)).toBeNull();

    await dragHandle(page, 'right', 120);

    const after = await contentWidth(page);
    // 中央寄せなので両端が対称に動き、幅はドラッグ量の約 2 倍広がる
    expect(after).toBeGreaterThan(before + 200);

    const saved = await savedWidth(page);
    expect(Number(saved)).toBeCloseTo(after, 0);
  });

  test('右ハンドルを内側へドラッグすると本文が狭まる', async ({ page }) => {
    const before = await contentWidth(page);
    await dragHandle(page, 'right', -100);
    expect(await contentWidth(page)).toBeLessThan(before - 150);
  });

  test('左ハンドルは外側（左）へのドラッグで広がる', async ({ page }) => {
    const before = await contentWidth(page);
    await dragHandle(page, 'left', -120);
    expect(await contentWidth(page)).toBeGreaterThan(before + 200);
  });

  test('プリセットの 3 段階では選べない幅にできる', async ({ page }) => {
    await dragHandle(page, 'right', 55);
    const width = await contentWidth(page);
    expect(width).not.toBe(960);
    expect(width).not.toBe(1280);
    expect(width).not.toBe(1600);
    expect(width).toBeGreaterThan(960);
    expect(width).toBeLessThan(1280);
  });

  test('下限より狭くはできない', async ({ page }) => {
    await dragHandle(page, 'right', -900);
    expect(await contentWidth(page)).toBe(400);
  });

  test('リロード後もドラッグした幅が復元される', async ({ page }) => {
    await dragHandle(page, 'right', 140);
    const dragged = await contentWidth(page);

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });

    expect(await contentWidth(page)).toBe(dragged);
  });

  test('ハンドルのダブルクリックでプリセット幅に戻る', async ({ page }) => {
    const preset = await contentWidth(page);
    await dragHandle(page, 'right', 140);
    expect(await contentWidth(page)).not.toBe(preset);

    await page.getByTestId('content-resizer-right').dblclick();

    expect(await contentWidth(page)).toBe(preset);
    expect(await savedWidth(page)).toBeNull();
  });

  test('設定ポップオーバーから現在幅を確認してリセットできる', async ({
    page,
  }) => {
    const preset = await contentWidth(page);

    await openSettingsMenu(page);
    await expect(page.getByTestId('content-width-reset')).toBeDisabled();
    await page.keyboard.press('Escape');

    await dragHandle(page, 'right', 140);
    const dragged = await contentWidth(page);

    await openSettingsMenu(page);
    const reset = page.getByTestId('content-width-reset');
    await expect(reset).toBeEnabled();
    await expect(reset).toHaveText(`幅をリセット（${Math.round(dragged)}px）`);

    await reset.click();
    expect(await contentWidth(page)).toBe(preset);
    expect(await savedWidth(page)).toBeNull();
  });

  test('キーボード（→ / ←）でも幅を変えられる', async ({ page }) => {
    const before = await contentWidth(page);
    const handle = page.getByTestId('content-resizer-right');
    await handle.focus();

    await page.keyboard.press('ArrowRight');
    const wider = await contentWidth(page);
    expect(wider).toBe(before + 32); // 16px ステップ × 倍率 2

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await contentWidth(page)).toBe(before - 32);

    await page.keyboard.press('Home');
    expect(await contentWidth(page)).toBe(before);
  });

  test('マージンを折りたたむとプリセットが優先され、その側のハンドルは消える', async ({
    page,
  }) => {
    await dragHandle(page, 'right', 60);
    expect(await savedWidth(page)).not.toBeNull();

    await openSettingsMenu(page);
    await page.getByTestId('margin-toggle-left').click();

    // 手動幅は破棄され、片側折りたたみのプリセット幅になる
    expect(await savedWidth(page)).toBeNull();
    expect(await contentWidth(page)).toBe(1280);

    // 左端は本文がコンテナ端に貼り付くのでハンドルを出さない
    await expect(page.getByTestId('content-resizer-left')).toHaveCount(0);
    await expect(page.getByTestId('content-resizer-right')).toBeAttached();
  });

  test('片側折りたたみ中はカーソルと 1:1 でリサイズされる', async ({
    page,
  }) => {
    await openSettingsMenu(page);
    await page.getByTestId('margin-toggle-left').click();
    await page.keyboard.press('Escape');

    const before = await contentWidth(page);
    await dragHandle(page, 'right', 100);
    expect(await contentWidth(page)).toBeCloseTo(before + 100, 0);
  });
});
