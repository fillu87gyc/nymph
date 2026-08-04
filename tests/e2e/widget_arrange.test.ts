/**
 * ウィジェット配置画面。
 *
 * メイン画面とは別に開く全画面の設定画面で、「利用可能」一覧と左右の枠の
 * あいだをドラッグ＆ドロップでウィジェットを移し、枠の中の上下の順番も
 * ドラッグで入れ替える。矢印キーでも同じ操作ができる。
 *
 * 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル
 * なので worker プール全体に分散させる。配置は localStorage 依存だが、
 * context フィクスチャがテストごとに作り直されるためテスト間で漏れない。
 */
import {
  arrangeColumnWidgets,
  closeSecondFile,
  closeWidgetArrange,
  dragWidget,
  expect,
  openSecondFile,
  openWidgetArrange,
  type Page,
  test,
} from './fixtures.ts';

test.describe.configure({ mode: 'parallel' });

/** 枠に積まれているウィジェットを上から順に返す（メイン画面側）。 */
async function slotWidgets(
  page: Page,
  side: 'left' | 'right',
): Promise<string[]> {
  return page
    .getByTestId(`widget-slot-${side}`)
    .locator('[data-widget]')
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-widget') ?? ''),
    );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.describe('画面の開閉', () => {
  test('設定ポップオーバーから開き、✕ で閉じる', async ({ page }) => {
    await expect(page.getByTestId('widget-arrange')).toBeHidden();
    await openWidgetArrange(page);
    // 別画面へ移るので設定ポップオーバーは畳まれる
    await expect(page.getByTestId('settings-menu')).toBeHidden();
    await expect(page.getByTestId('widget-arrange')).toBeVisible();

    await page.getByTestId('widget-arrange-close').click();
    await expect(page.getByTestId('widget-arrange')).toBeHidden();
    // 元の画面はそのまま残っている
    await expect(page.locator('#content')).toBeVisible();
  });

  test('Escape で閉じる', async ({ page }) => {
    await openWidgetArrange(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('widget-arrange')).toBeHidden();
  });

  test('既定の配置が 3 列に並ぶ', async ({ page }) => {
    await openWidgetArrange(page);
    expect(await arrangeColumnWidgets(page, 'available')).toEqual([
      'tabs',
      'comments',
    ]);
    expect(await arrangeColumnWidgets(page, 'left')).toEqual(['explorer']);
    expect(await arrangeColumnWidgets(page, 'right')).toEqual(['outline']);
  });
});

test.describe('ドラッグ＆ドロップ', () => {
  test('利用可能から左の枠へドラッグすると実際の画面に反映される', async ({
    page,
  }) => {
    await dragWidget(page, 'tabs', 'left');
    expect(await arrangeColumnWidgets(page, 'available')).toEqual(['comments']);
    await closeWidgetArrange(page);

    await expect(page.getByTestId('tabs-widget')).toBeVisible();
    await expect(page.locator('#file-tabs')).toHaveAttribute(
      'data-orientation',
      'vertical',
    );
  });

  test('枠から利用可能へ戻すと既定の位置に出る', async ({
    page,
    fixturePath,
  }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      await dragWidget(page, 'tabs', 'left');
      await closeWidgetArrange(page);
      await expect(page.locator('#file-tabs')).toHaveAttribute(
        'data-orientation',
        'vertical',
      );

      await dragWidget(page, 'tabs', 'available');
      await closeWidgetArrange(page);
      await expect(page.getByTestId('tabs-widget')).toBeHidden();
      await expect(page.locator('#file-tabs')).toHaveAttribute(
        'data-orientation',
        'horizontal',
      );
    } finally {
      await closeSecondFile(page, second.path);
    }
  });

  test('左右の枠のあいだを行き来できる', async ({ page }) => {
    await page.locator('#btn-toc').click();
    await dragWidget(page, 'outline', 'left');
    expect(await arrangeColumnWidgets(page, 'left')).toEqual([
      'explorer',
      'outline',
    ]);
    expect(await arrangeColumnWidgets(page, 'right')).toEqual([]);
    await expect(page.getByTestId('widget-empty-right')).toBeVisible();
    await closeWidgetArrange(page);

    await expect(
      page.getByTestId('widget-slot-left').getByTestId('toc-panel'),
    ).toBeVisible();
    await expect(page.getByTestId('widget-slot-right')).toBeHidden();
  });

  test('枠の中の上下の順番を入れ替えられる', async ({ page, fixturePath }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      await page.locator('#btn-toc').click();
      await dragWidget(page, 'tabs', 'left');
      await dragWidget(page, 'outline', 'left');
      expect(await arrangeColumnWidgets(page, 'left')).toEqual([
        'explorer',
        'tabs',
        'outline',
      ]);
      await closeWidgetArrange(page);
      // エクスプローラーはルート未指定で描画されないので、実画面はタブ→アウトライン
      expect(await slotWidgets(page, 'left')).toEqual(['tabs', 'outline']);

      // アウトラインを先頭（エクスプローラーの上）へ動かす
      await dragWidget(page, 'outline', 'left', 0);
      expect(await arrangeColumnWidgets(page, 'left')).toEqual([
        'outline',
        'explorer',
        'tabs',
      ]);
      await closeWidgetArrange(page);
      expect(await slotWidgets(page, 'left')).toEqual(['outline', 'tabs']);
    } finally {
      await closeSecondFile(page, second.path);
    }
  });

  test('スロット専用ウィジェットは利用可能へ落とせない', async ({ page }) => {
    await openWidgetArrange(page);
    const list = page.getByTestId('widget-arrange-list-available');
    await page.getByTestId('widget-chip-outline').dragTo(list);
    // 受け付けないので配置は変わらない
    expect(await arrangeColumnWidgets(page, 'available')).toEqual([
      'tabs',
      'comments',
    ]);
    expect(await arrangeColumnWidgets(page, 'right')).toEqual(['outline']);
  });

  test('ウィジェットのドラッグでファイルのドロップ案内は出ない', async ({
    page,
  }) => {
    await openWidgetArrange(page);
    const chip = page.getByTestId('widget-chip-tabs');
    const box = await chip.boundingBox();
    if (!box) throw new Error('chip not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const target = await page.getByTestId('widget-drop-left-0').boundingBox();
    if (!target) throw new Error('drop target not visible');
    await page.mouse.move(target.x + target.width / 2, target.y + 2, {
      steps: 5,
    });
    await expect(page.locator('#drop-overlay')).toHaveCount(0);
    await page.mouse.up();
    expect(await arrangeColumnWidgets(page, 'left')).toEqual([
      'tabs',
      'explorer',
    ]);
  });
});

test.describe('キーボード操作', () => {
  test('→ で枠へ移し、↑ で枠の中を上げる', async ({ page }) => {
    await openWidgetArrange(page);
    await page.getByTestId('widget-chip-tabs').focus();
    await page.keyboard.press('ArrowRight');
    expect(await arrangeColumnWidgets(page, 'left')).toEqual([
      'explorer',
      'tabs',
    ]);
    // 動かしたチップにフォーカスが残るので、続けて操作できる
    await expect(page.getByTestId('widget-chip-tabs')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    expect(await arrangeColumnWidgets(page, 'left')).toEqual([
      'tabs',
      'explorer',
    ]);
    await expect(page.getByTestId('widget-arrange-status')).toHaveText(
      'タブを左の枠の1番目に置きました',
    );

    await closeWidgetArrange(page);
    await expect(page.getByTestId('tabs-widget')).toBeVisible();
  });

  test('← で利用可能へ戻せる', async ({ page }) => {
    await dragWidget(page, 'comments', 'right');
    await page.getByTestId('widget-chip-comments').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await arrangeColumnWidgets(page, 'available')).toEqual([
      'tabs',
      'comments',
    ]);
  });
});

test.describe('既定に戻す / 永続化', () => {
  test('既定に戻すと元の配置になる', async ({ page }) => {
    await dragWidget(page, 'tabs', 'left');
    await dragWidget(page, 'outline', 'left');
    await page.getByTestId('widget-arrange-reset').click();
    expect(await arrangeColumnWidgets(page, 'left')).toEqual(['explorer']);
    expect(await arrangeColumnWidgets(page, 'right')).toEqual(['outline']);
    expect(await arrangeColumnWidgets(page, 'available')).toEqual([
      'tabs',
      'comments',
    ]);

    await closeWidgetArrange(page);
    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });
    await openWidgetArrange(page);
    expect(await arrangeColumnWidgets(page, 'left')).toEqual(['explorer']);
  });

  test('ドラッグした配置はリロード後も残る', async ({ page }) => {
    await dragWidget(page, 'tabs', 'left', 0);
    expect(await arrangeColumnWidgets(page, 'left')).toEqual([
      'tabs',
      'explorer',
    ]);
    await closeWidgetArrange(page);

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });
    await openWidgetArrange(page);
    expect(await arrangeColumnWidgets(page, 'left')).toEqual([
      'tabs',
      'explorer',
    ]);
  });
});
