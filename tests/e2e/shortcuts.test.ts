/**
 * キーボードショートカット（小粒 UX タスク #1）
 *
 * `?` で一覧、`C` でコメントパネル開閉、`T` でテーマ切替。
 * 判定そのものは tests/unit/shortcuts.test.ts が見ているので、ここでは
 * 「実際のキー入力が画面に届くか」と、届いてはいけない場面（入力欄に
 * フォーカスがある / 別のモーダルが出ている）で止まるかを確認する。
 *
 * fixturePath も reviewDir も書き換えない読み取り専用テストなので、
 * 1 ワーカーに固定せず worker プール全体へ分散させる。
 */
import { expect, openOverflowMenu, test } from './fixtures.ts';

test.describe.configure({ mode: 'parallel' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.describe('ショートカット一覧（?）', () => {
  test('? で開き、もう一度 ? で閉じる', async ({ page }) => {
    await expect(page.getByTestId('shortcuts-modal')).not.toBeVisible();

    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts-modal')).toBeVisible();

    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts-modal')).not.toBeVisible();
  });

  test('Esc と ✕ で閉じる', async ({ page }) => {
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcuts-modal')).not.toBeVisible();

    await page.keyboard.press('?');
    await page.getByTestId('shortcuts-close').click();
    await expect(page.getByTestId('shortcuts-modal')).not.toBeVisible();
  });

  test('⋯ メニューからも開ける', async ({ page }) => {
    await openOverflowMenu(page);
    await page.getByTestId('shortcuts-btn').click();

    await expect(page.getByTestId('shortcuts-modal')).toBeVisible();
    await expect(page.getByTestId('overflow-menu')).not.toBeVisible();
  });

  test('割り当てたキーが一覧に載っている', async ({ page }) => {
    await page.keyboard.press('?');
    const modal = page.getByTestId('shortcuts-modal');

    for (const cap of ['?', 'Ctrl / Cmd', 'C', 'T', 'Esc']) {
      await expect(
        modal.locator('kbd', { hasText: cap }).first(),
      ).toBeVisible();
    }
  });
});

test.describe('C / T', () => {
  test('C でコメントパネルが開閉する', async ({ page }) => {
    const panel = page.locator('#comments-panel');
    await expect(panel).toHaveAttribute('data-open', 'false');

    await page.keyboard.press('c');
    await expect(panel).toHaveAttribute('data-open', 'true');

    await page.keyboard.press('c');
    await expect(panel).toHaveAttribute('data-open', 'false');
  });

  test('T でテーマが切り替わる', async ({ page }) => {
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.keyboard.press('t');
    await expect(html).toHaveAttribute('data-theme', 'light');
    // 設定ポップオーバーからの切替と同じく localStorage に残る
    expect(await page.evaluate(() => localStorage.getItem('nymph-theme'))).toBe(
      'light',
    );

    await page.keyboard.press('t');
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('拾ってはいけない場面', () => {
  test('入力欄への文字入力を横取りしない', async ({ page }) => {
    // Quick Open の検索欄に "ct" と打つ。ショートカットが動いてしまうと
    // テーマが変わり、パネルが開き、文字も入らない。
    await page.keyboard.press('Control+p');
    const input = page.getByTestId('quick-open-input');
    await expect(input).toBeVisible();

    await input.fill('ct');

    await expect(input).toHaveValue('ct');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#comments-panel')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  test('一覧を開いている間は C / T が効かない', async ({ page }) => {
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts-modal')).toBeVisible();

    await page.keyboard.press('t');
    await page.keyboard.press('c');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#comments-panel')).toHaveAttribute(
      'data-open',
      'false',
    );
    // 一覧自体は開いたまま
    await expect(page.getByTestId('shortcuts-modal')).toBeVisible();
  });

  test('Ctrl / Cmd と一緒に押しても T は反応しない', async ({ page }) => {
    // Ctrl+T（新しいタブ）を奪わない
    await page.keyboard.press('Control+t');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
