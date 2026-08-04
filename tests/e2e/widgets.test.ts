/**
 * ウィジェット配置。
 *
 * 画面左右の枠（WidgetSlot）に、タブ / エクスプローラー / アウトライン /
 * コメントのどれを積むかを設定ポップオーバーから決められる。配置は
 * localStorage に保存され、リロード後も維持される。
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

/** 配置画面でウィジェットを目的の場所（末尾）へドラッグする。 */
async function placeWidget(
  page: Page,
  id: 'tabs' | 'explorer' | 'outline' | 'comments',
  placement: 'left' | 'right' | 'default',
): Promise<void> {
  await dragWidget(page, id, placement === 'default' ? 'available' : placement);
}

/** 枠に積まれているウィジェットを上から順に返す。 */
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

test.describe('既定の配置', () => {
  test('タブは横行のまま、アウトラインは右枠に出る', async ({
    page,
    fixturePath,
  }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      await expect(page.locator('#file-tabs')).toHaveAttribute(
        'data-orientation',
        'horizontal',
      );
      // アウトラインを開くまで右枠は出ない（空の枠を描かない）
      await expect(page.getByTestId('widget-slot-right')).toBeHidden();
      await page.locator('#btn-toc').click();
      await expect(page.getByTestId('widget-slot-right')).toBeVisible();
      await expect(
        page.getByTestId('widget-slot-right').getByTestId('toc-panel'),
      ).toBeVisible();
      // ルートディレクトリが無いのでエクスプローラーは出ず、左枠ごと現れない
      await expect(page.getByTestId('widget-slot-left')).toBeHidden();
    } finally {
      await closeSecondFile(page, second.path);
    }
  });
});

test.describe('タブウィジェット', () => {
  test('左枠に置くと縦タブになり、横行は消える', async ({
    page,
    fixturePath,
  }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      await placeWidget(page, 'tabs', 'left');
      await closeWidgetArrange(page);

      await expect(page.getByTestId('widget-slot-left')).toBeVisible();
      await expect(page.getByTestId('tabs-widget')).toBeVisible();
      await expect(page.locator('#file-tabs')).toHaveAttribute(
        'data-orientation',
        'vertical',
      );
      expect(await slotWidgets(page, 'left')).toEqual(['tabs']);
    } finally {
      await closeSecondFile(page, second.path);
    }
  });

  test('縦タブからファイルを切り替えられる', async ({ page, fixturePath }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      await placeWidget(page, 'tabs', 'left');
      await closeWidgetArrange(page);

      await page
        .getByTestId('tabs-widget')
        .locator('button', { hasText: second.name })
        .click();
      await expect(page.locator('#content')).toContainText('Second', {
        timeout: 5000,
      });
      await expect(
        page
          .getByTestId('tabs-widget')
          .locator('button', { hasText: second.name }),
      ).toHaveAttribute('data-active', 'true');
    } finally {
      await closeSecondFile(page, second.path);
    }
  });

  test('1ファイルでも縦タブは表示される（横行は出ない）', async ({ page }) => {
    await expect(page.locator('#file-tabs')).toBeHidden();
    await placeWidget(page, 'tabs', 'left');
    await closeWidgetArrange(page);
    await expect(page.getByTestId('tabs-widget')).toBeVisible();
  });

  test('既定位置（横行）に戻せる', async ({ page, fixturePath }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      await placeWidget(page, 'tabs', 'left');
      await placeWidget(page, 'tabs', 'default');
      await closeWidgetArrange(page);

      await expect(page.getByTestId('tabs-widget')).toBeHidden();
      await expect(page.locator('#file-tabs')).toHaveAttribute(
        'data-orientation',
        'horizontal',
      );
      await expect(page.getByTestId('widget-slot-left')).toBeHidden();
    } finally {
      await closeSecondFile(page, second.path);
    }
  });
});

test.describe('複数ウィジェットを積む', () => {
  test('左枠にタブとアウトラインを縦に積める', async ({
    page,
    fixturePath,
  }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      await page.locator('#btn-toc').click();
      await placeWidget(page, 'tabs', 'left');
      await placeWidget(page, 'outline', 'left');
      await closeWidgetArrange(page);

      // 置いた順に上から積まれる
      expect(await slotWidgets(page, 'left')).toEqual(['tabs', 'outline']);
      await expect(
        page.getByTestId('widget-slot-left').getByTestId('tabs-widget'),
      ).toBeVisible();
      await expect(
        page.getByTestId('widget-slot-left').getByTestId('toc-panel'),
      ).toBeVisible();
      // アウトラインが左へ移ったので右枠は空になり、枠ごと消える
      await expect(page.getByTestId('widget-slot-right')).toBeHidden();
    } finally {
      await closeSecondFile(page, second.path);
    }
  });

  test('アウトラインは同時に 2 箇所へは出ない', async ({ page }) => {
    await page.locator('#btn-toc').click();
    await placeWidget(page, 'outline', 'left');
    await closeWidgetArrange(page);
    await expect(page.getByTestId('toc-panel')).toHaveCount(1);
  });
});

test.describe('コメントウィジェット', () => {
  test('右枠に置くと下ドックが消え、高さドラッグも無くなる', async ({
    page,
  }) => {
    await page.locator('#btn-comments').click();
    await expect(page.locator('#comments-panel')).toHaveAttribute(
      'data-variant',
      'dock',
    );

    await placeWidget(page, 'comments', 'right');
    await closeWidgetArrange(page);

    await expect(page.locator('#comments-panel')).toHaveAttribute(
      'data-variant',
      'slot',
    );
    await expect(
      page.getByTestId('widget-slot-right').locator('#comments-panel'),
    ).toBeVisible();
    await expect(page.locator('#panel-resize-handle')).toHaveCount(0);
  });

  test('枠に置いたまま閉じると枠ごと消える', async ({ page }) => {
    await page.locator('#btn-comments').click();
    await placeWidget(page, 'comments', 'right');
    await closeWidgetArrange(page);
    await expect(page.getByTestId('widget-slot-right')).toBeVisible();

    await page.locator('#btn-close-panel').click();
    await expect(page.getByTestId('widget-slot-right')).toBeHidden();
    await expect(page.locator('#comments-panel')).toHaveCount(0);
  });
});

test.describe('配置の永続化', () => {
  test('リロードしても配置が残る', async ({ page, fixturePath }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      await placeWidget(page, 'tabs', 'left');
      await placeWidget(page, 'outline', 'left');
      await closeWidgetArrange(page);

      await page.reload();
      await expect(
        page.locator('#content [data-testid="md-block"]').first(),
      ).toBeVisible({ timeout: 5000 });

      await expect(page.getByTestId('tabs-widget')).toBeVisible();
      // 開閉状態（アウトラインを出すか）は配置とは別軸でセッション限り。
      // 開き直すと、保存済みの配置どおり左枠のタブの下に戻る。
      await page.locator('#btn-toc').click();
      expect(await slotWidgets(page, 'left')).toEqual(['tabs', 'outline']);
      // 配置画面側にも保存済みの配置が反映されている（画面に出ていない
      // エクスプローラーも、配置としては左枠に入ったまま並んでいる）
      await openWidgetArrange(page);
      expect(await arrangeColumnWidgets(page, 'left')).toEqual([
        'explorer',
        'tabs',
        'outline',
      ]);
    } finally {
      await closeSecondFile(page, second.path);
    }
  });
});
