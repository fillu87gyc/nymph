/**
 * Mermaid ラベルはみ出し回帰テスト
 *
 * mermaid の HTML ラベルは <foreignObject> の中に
 *   <div><span class="nodeLabel"><p>テキスト</p></span></div>
 * を生成する。この <p> は #content 配下にあるため、本文用の
 * `#content p { font-family: var(--content-font); … }` が当たると、
 * mermaid が config.fontFamily 前提で計測・固定した枠寸法と実際の描画
 * フォントが食い違い、テキストが枠からはみ出す・切れる。
 *
 * 特に拡大モーダルは SVG を #content の外へ複製するため本文ルールが外れ、
 * ラベルだけフォントが変わって派手に破綻する（このテストの主目的）。
 *
 * 検証は「行ボックスが foreignObject の枠内に収まっているか」で行う。
 * 折り返し有無に依存せず、フォント不一致があれば必ず枠から出るため、
 * 実描画に対する素直な回帰検出になる。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, openSettingsMenu, type Page, test } from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

/** ASCII / 日本語・ノードラベル・エッジラベルを一通り含む図 */
const MERMAID_DOC = `# Mermaid label overflow

\`\`\`mermaid
graph LR
  A[Open nymph] -->|Yes| B{Checkpoint set?}
  B -->|No| C[Enable diff mode]
  C --> D[レビューを開始する]
\`\`\`
`;

/** mermaid.initialize に渡している図用フォント（ContentArea.tsx と対応） */
const DIAGRAM_FONT = 'JetBrains Mono';

interface LabelBox {
  text: string;
  /** 行ボックスが foreignObject の枠からはみ出した最大量（px, 正ならはみ出し） */
  overflow: number;
  fontFamily: string;
  width: number;
}

/**
 * SVG ラベル（foreignObject）ごとに、実際に描画されている行ボックスが
 * 枠内へ収まっているかを測る。戻り値の overflow が正ならはみ出している。
 */
async function measureLabels(page: Page, root: string): Promise<LabelBox[]> {
  return page.evaluate((selector) => {
    const out: LabelBox[] = [];
    document.querySelectorAll(`${selector} svg foreignObject`).forEach((fo) => {
      const text = (fo.textContent ?? '').trim();
      const p = fo.querySelector('p');
      if (!text || !p) return;
      const box = fo.getBoundingClientRect();

      // テキストノードごとの行ボックス（折り返し後の実描画矩形）を取得する
      let overflow = Number.NEGATIVE_INFINITY;
      const walker = document.createTreeWalker(fo, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!(node.textContent ?? '').trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width === 0) continue;
          overflow = Math.max(
            overflow,
            box.left - rect.left,
            rect.right - box.right,
          );
        }
      }
      if (overflow === Number.NEGATIVE_INFINITY) return;

      out.push({
        text,
        overflow: Math.round(overflow * 100) / 100,
        fontFamily: getComputedStyle(p).fontFamily,
        width: Math.round(box.width * 100) / 100,
      });
    });
    return out;
  }, root);
}

test.beforeEach(async ({ page, fixturePath }) => {
  writeFileSync(fixturePath, MERMAID_DOC);
  await page.goto('/');
  await expect(page.locator('#content .mermaid svg')).toBeVisible({
    timeout: 15000,
  });
});

test.afterEach(async ({ fixturePath }) => {
  writeFileSync(fixturePath, ORIGINAL);
});

test.describe('mermaid ラベルが枠からはみ出さない', () => {
  test('ラベルは本文フォントではなく図用フォントで描画される', async ({
    page,
  }) => {
    const labels = await measureLabels(page, '#content .mermaid');
    expect(labels.length).toBeGreaterThan(0);

    const contentFont = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        '--content-font',
      ),
    );
    expect(contentFont).toContain('Inter');

    for (const label of labels) {
      expect(label.fontFamily, `label: ${label.text}`).toContain(DIAGRAM_FONT);
    }
  });

  test('インライン表示でテキストがノード枠内に収まる', async ({ page }) => {
    const labels = await measureLabels(page, '#content .mermaid');
    expect(labels.length).toBeGreaterThan(0);

    for (const label of labels) {
      // 1px はスケール済み SVG 上の丸め誤差ぶんの許容
      expect(label.overflow, `label: ${label.text}`).toBeLessThanOrEqual(1);
    }
  });

  test('拡大モーダルでもテキストがノード枠内に収まる', async ({ page }) => {
    await page.locator('[data-testid="mermaid-area"]').first().click();
    await expect(page.locator('#mermaid-zoom-area svg').first()).toBeVisible();

    const labels = await measureLabels(page, '#mermaid-zoom-area');
    expect(labels.length).toBeGreaterThan(0);

    for (const label of labels) {
      expect(label.fontFamily, `label: ${label.text}`).toContain(DIAGRAM_FONT);
      expect(label.overflow, `label: ${label.text}`).toBeLessThanOrEqual(1);
    }
  });

  test('本文フォントを切り替えてもラベルの描画は変わらない', async ({
    page,
  }) => {
    const before = await measureLabels(page, '#content .mermaid');

    await openSettingsMenu(page);
    await page.selectOption('#content-font-select', 'default');
    await expect
      .poll(async () =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue(
            '--content-font',
          ),
        ),
      )
      .toContain('Lora');

    const after = await measureLabels(page, '#content .mermaid');
    expect(after).toEqual(before);
  });
});
