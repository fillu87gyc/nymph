/**
 * 「全ファイルを閉じたら本文が消える」ことの保証。
 *
 * タブは横行だと2ファイル以上でしか出ないが、枠に置いた縦置き（タブ
 * ウィジェット）は1ファイルでも × を出すので、ここからは「開いている
 * ファイル 0 件」まで閉じられる。そこまで閉じたら本文は消えて welcome
 * 画面に戻らなければならない。
 *
 * 回帰対象: ドロップ由来の擬似タブを最後に閉じても本文が消えなかったバグ。
 * 擬似タブの本文と「1つも開いていない」の本文は同じ SWR キー（'/content'）
 * で配信されるため、閉じてもキーが変わらず SWR が取り直さない ＝ 直前に
 * 見ていたファイルがそのまま画面に残り続けていた。
 */
import {
  closeSecondFile,
  closeWidgetArrange,
  dragWidget,
  expect,
  openSecondFile,
  type Page,
  test,
} from './fixtures.ts';

// 本文の書き換えはしないが、サーバーのタブ状態（activeFile / 擬似タブ）を
// 変えるので afterEach で必ず元に戻す。
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
  // タブウィジェットを左枠に置く（縦置きなら1ファイルでも × が出る）
  await dragWidget(page, 'tabs', 'left');
  await closeWidgetArrange(page);
});

test.afterEach(async ({ page, fixturePath }) => {
  // 閉じたファイルと擬似タブを片付け、同一 worker の後続テストへ漏らさない
  await page.request
    .post('/close-file', { data: { path: '__dropped__' } })
    .catch(() => {});
  await page.request
    .post('/open-file', { data: { path: fixturePath } })
    .catch(() => {});
});

/** ウィジェットのタブを先頭から順に × で全部閉じる。 */
async function closeAllTabs(page: Page): Promise<void> {
  const widget = page.getByTestId('tabs-widget');
  for (
    let remaining = await widget.locator('button').count();
    remaining > 0;
  ) {
    await widget.locator('button').first().getByTestId('tab-close').click();
    remaining -= 1;
    await expect(widget.locator('button')).toHaveCount(remaining);
  }
}

/** 本物の drop イベントで .md を1つ開く（擬似タブが増えて選択される）。 */
async function dropFile(page: Page, name: string, content: string) {
  const dataTransfer = await page.evaluateHandle(
    ({ name, content }: { name: string; content: string }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([content], name, { type: 'text/plain' }));
      return dt;
    },
    { name, content },
  );
  await page.dispatchEvent('#app', 'dragover', { dataTransfer });
  await page.dispatchEvent('#app', 'drop', { dataTransfer });
}

test('実ファイルを全部閉じると welcome 画面に戻る', async ({
  page,
  fixturePath,
}) => {
  const second = await openSecondFile(page, fixturePath);
  try {
    await expect(page.getByTestId('tabs-widget').locator('button')).toHaveCount(
      2,
    );
    await closeAllTabs(page);

    await expect(page.locator('#welcome-msg')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#content [data-testid="md-block"]')).toHaveCount(
      0,
    );
  } finally {
    await closeSecondFile(page, second.path);
  }
});

test('ドロップした擬似タブを最後に閉じても本文が残らない', async ({ page }) => {
  await dropFile(page, 'dropped.md', '# Dropped Tab\n\nDropped body.\n');
  await expect(page.locator('#content h1')).toContainText('Dropped Tab', {
    timeout: 3000,
  });
  // 実ファイル + 擬似タブの2件。実ファイルを先に閉じるので、最後に閉じるのは擬似タブ。
  await expect(page.getByTestId('tabs-widget').locator('button')).toHaveCount(
    2,
  );

  await closeAllTabs(page);

  await expect(page.locator('#welcome-msg')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#content [data-testid="md-block"]')).toHaveCount(
    0,
  );
  await expect(page.locator('#content h1')).toHaveCount(0);
});
