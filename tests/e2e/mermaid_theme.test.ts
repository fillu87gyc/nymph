/**
 * Mermaid テーマ追従の回帰テスト
 *
 * mermaid.run() は描画済み（data-processed）の図をスキップするため、テーマを
 * 切り替えても既に描かれた図は前のテーマの色のまま残り、ブラウザをリロード
 * するまで直らない、という不具合があった。
 *
 * 「切替直後の見た目」＝「そのテーマでリロードした見た目」であることを
 * 確認する（リロード不要でテーマに追従している、の定義）。
 */
import { expect, openSettingsMenu, test } from './fixtures.ts';

// 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル
// なので、1 ワーカーに固定せず全テストを worker プール全体に分散させる
// （各テストは _workerServer 経由で独立したサーバー/ポートを持つため安全）。
test.describe.configure({ mode: 'parallel' });

/**
 * 描画済み mermaid 図の配色シグネチャ。
 * ノード図形の塗り／枠線とラベル色という、テーマで必ず変わる実際の描画結果を
 * computed style から集める（SVG 内の <style> 文字列ではなく見た目を見る）。
 */
async function diagramColors(page: import('@playwright/test').Page) {
  return page
    .locator('#content .mermaid svg')
    .first()
    .evaluate((svg) => {
      const parts: string[] = [];
      for (const node of svg.querySelectorAll('.node')) {
        const shape = node.querySelector('rect, polygon, circle, path');
        if (shape) {
          const s = getComputedStyle(shape);
          parts.push(`${s.fill}/${s.stroke}`);
        }
        const label = node.querySelector('.nodeLabel, foreignObject div, text');
        if (label) parts.push(getComputedStyle(label).color);
      }
      for (const edge of svg.querySelectorAll(
        '.flowchart-link, .edgePath path',
      )) {
        parts.push(getComputedStyle(edge).stroke);
      }
      return parts.join(' ');
    });
}

async function waitForDiagram(page: import('@playwright/test').Page) {
  await expect(page.locator('#content .mermaid svg').first()).toBeVisible({
    timeout: 8000,
  });
  // 色を読む前に、ノードまで描き切っていることを保証する
  await expect(page.locator('#content .mermaid svg .node').first()).toBeVisible(
    {
      timeout: 8000,
    },
  );
}

async function toggleTheme(page: import('@playwright/test').Page) {
  await openSettingsMenu(page);
  await page.locator('#btn-theme').click();
}

test.beforeEach(async ({ page }) => {
  // localStorage 未設定時の既定は dark。dark で立ち上げた状態から始める。
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('nymph-theme'));
  await page.reload();
  await waitForDiagram(page);
});

test.describe('mermaid のテーマ追従', () => {
  test('dark → light の切替でリロードせずに配色が変わる', async ({ page }) => {
    const darkColors = await diagramColors(page);
    expect(darkColors).not.toBe('');

    await toggleTheme(page);

    await expect
      .poll(() => diagramColors(page), { timeout: 8000 })
      .not.toBe(darkColors);

    // 図はテキストに戻らず SVG のまま（描き直しが完了している）
    await expect(
      page.locator('#content .mermaid svg .node').first(),
    ).toBeVisible();
  });

  test('切替直後の配色が light でリロードしたときと一致する', async ({
    page,
  }) => {
    const darkColors = await diagramColors(page);

    await toggleTheme(page);
    await expect
      .poll(() => diagramColors(page), { timeout: 8000 })
      .not.toBe(darkColors);
    const afterToggle = await diagramColors(page);

    await page.reload();
    await waitForDiagram(page);
    expect(await diagramColors(page)).toBe(afterToggle);
  });

  test('light → dark に戻すと元の配色に戻る', async ({ page }) => {
    const darkColors = await diagramColors(page);

    await toggleTheme(page);
    await expect
      .poll(() => diagramColors(page), { timeout: 8000 })
      .not.toBe(darkColors);

    await toggleTheme(page);
    await expect
      .poll(() => diagramColors(page), { timeout: 8000 })
      .toBe(darkColors);
  });
});
