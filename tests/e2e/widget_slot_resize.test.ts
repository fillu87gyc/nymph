/**
 * ウィジェット枠の幅ドラッグ。
 *
 * 枠と本文の境目に付いたハンドルを掴むとサイドバーの幅が変わる
 * （本文の行長を変える content_width_drag.test.ts とは掴む場所も
 * 変わるものも別）。幅は localStorage に保存されリロード後も残る。
 *
 * 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル
 * なので worker プール全体に分散させる。幅は localStorage 依存だが、
 * context フィクスチャがテストごとに作り直されるためテスト間で漏れない。
 */
import {
  closeWidgetArrange,
  dragWidget,
  expect,
  type Page,
  test,
} from './fixtures.ts';

test.describe.configure({ mode: 'parallel' });

const STORAGE_KEY = 'nymph-slot-width';

async function slotWidth(page: Page, side: 'left' | 'right'): Promise<number> {
  return page
    .getByTestId(`widget-slot-${side}`)
    .evaluate((el) => el.getBoundingClientRect().width);
}

async function savedWidths(
  page: Page,
): Promise<{ left?: number; right?: number } | null> {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    STORAGE_KEY,
  );
  return raw === null ? null : JSON.parse(raw);
}

/** ハンドルの中心を掴んで dx だけ水平にドラッグする。 */
async function dragHandle(
  page: Page,
  side: 'left' | 'right',
  dx: number,
): Promise<void> {
  const handle = page.getByTestId(`widget-slot-resizer-${side}`);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`slot resize handle not found: ${side}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // 途中経過を挟むことで pointermove が確実に発火する
  await page.mouse.move(x + dx / 2, y);
  await page.mouse.move(x + dx, y);
  await page.mouse.up();
}

/** 右枠（アウトライン）を出す。既定配置ではトグルを押すまで枠ごと出ない。 */
async function showRightSlot(page: Page): Promise<void> {
  await page.locator('#btn-toc').click();
  await expect(page.getByTestId('widget-slot-right')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.describe('ウィジェット枠の幅ドラッグ', () => {
  test('既定幅は移設前と同じ 220px で、ハンドルが枠に付く', async ({
    page,
  }) => {
    await showRightSlot(page);
    expect(await slotWidth(page, 'right')).toBe(220);
    await expect(page.getByTestId('widget-slot-resizer-right')).toBeAttached();
    expect(await savedWidths(page)).toBeNull();
  });

  test('右枠は左へドラッグすると広がり localStorage に保存される', async ({
    page,
  }) => {
    await showRightSlot(page);
    await dragHandle(page, 'right', -80);

    expect(await slotWidth(page, 'right')).toBe(300);
    expect(await savedWidths(page)).toMatchObject({ right: 300 });
  });

  test('右枠は右へドラッグすると狭まる（掴んだ境界が付いてくる）', async ({
    page,
  }) => {
    await showRightSlot(page);
    await dragHandle(page, 'right', 40);
    expect(await slotWidth(page, 'right')).toBe(180);
  });

  test('下限より狭く・上限より広くはできない', async ({ page }) => {
    await showRightSlot(page);
    await dragHandle(page, 'right', 500);
    expect(await slotWidth(page, 'right')).toBe(140);

    await dragHandle(page, 'right', -900);
    expect(await slotWidth(page, 'right')).toBe(480);
  });

  test('枠を広げても本文は消えず、本文列がその分だけ狭くなる', async ({
    page,
  }) => {
    await showRightSlot(page);
    const before = await page
      .getByTestId('content-scroll')
      .evaluate((el) => el.getBoundingClientRect().width);

    await dragHandle(page, 'right', -120);

    const after = await page
      .getByTestId('content-scroll')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBeCloseTo(before - 120, 0);
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible();
  });

  test('リロード後もドラッグした幅が復元される', async ({ page }) => {
    await showRightSlot(page);
    await dragHandle(page, 'right', -60);
    const dragged = await slotWidth(page, 'right');

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });
    await showRightSlot(page);

    expect(await slotWidth(page, 'right')).toBe(dragged);
  });

  test('ハンドルのダブルクリックで既定幅に戻る', async ({ page }) => {
    await showRightSlot(page);
    await dragHandle(page, 'right', -60);
    expect(await slotWidth(page, 'right')).not.toBe(220);

    await page.getByTestId('widget-slot-resizer-right').dblclick();

    expect(await slotWidth(page, 'right')).toBe(220);
    expect(await savedWidths(page)).toMatchObject({ right: 220 });
  });

  test('キーボード（→ / ← / Home）でも幅を変えられる', async ({ page }) => {
    await showRightSlot(page);
    const handle = page.getByTestId('widget-slot-resizer-right');
    await handle.focus();

    // 右枠のハンドルは右へ動かすほど狭まる
    await page.keyboard.press('ArrowRight');
    expect(await slotWidth(page, 'right')).toBe(204);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await slotWidth(page, 'right')).toBe(236);

    await page.keyboard.press('Home');
    expect(await slotWidth(page, 'right')).toBe(220);
  });

  test('左枠は右へドラッグすると広がり、右枠とは別々に保存される', async ({
    page,
  }) => {
    // 既定配置では左枠に出るのはエクスプローラーだけで、ルート未指定のこの
    // フィクスチャでは出ない。文書統計を左枠へ置いて枠を出す。
    await dragWidget(page, 'stats', 'left');
    await closeWidgetArrange(page);
    await expect(page.getByTestId('widget-slot-left')).toBeVisible();
    expect(await slotWidth(page, 'left')).toBe(240);

    await showRightSlot(page);
    await dragHandle(page, 'left', 60);

    expect(await slotWidth(page, 'left')).toBe(300);
    expect(await slotWidth(page, 'right')).toBe(220);
    expect(await savedWidths(page)).toMatchObject({ left: 300, right: 220 });
  });
});
