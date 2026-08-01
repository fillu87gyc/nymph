/**
 * dict.json の外部更新が SSE 経由でリロードなしに反映されることを検証する。
 *
 * dict_sync.test.ts はユーザーが「辞書更新」ボタンを押す（POST /dict/sync）
 * 経路だけを検証していた。実際にはサーバーが dict.json を fs.watch しており
 * （src/server.ts の attachDictWatcher）、外部プロセス（nymph dict build を
 * 別ターミナルで実行、等）が dict.json を書き換えるだけで /watch から
 * `{ dictUpdated: true }` が push され、クライアントは useSSE → revalidateDict()
 * 経由でリロードなしに辞書を再取得する。この push 経路はどこでも検証されて
 * いなかった。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from './fixtures.ts';

function dictJson(entries: unknown[]) {
  return JSON.stringify(
    { version: 1, updatedAt: new Date().toISOString(), entries },
    null,
    2,
  );
}

test.describe('dict: SSE dictUpdated による自動反映', () => {
  test('外部から dict.json が更新されると、リロードなしでツールチップに反映される', async ({
    page,
    dictDir,
    dictPath,
  }) => {
    mkdirSync(dictDir, { recursive: true });
    writeFileSync(dictPath, dictJson([]));

    await page.goto('/');
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });

    // 初期状態: 辞書が空なので "Sample" はハイライトされない
    await expect(page.locator('[data-dict-term="Sample"]')).toHaveCount(0);

    // 外部プロセス（nymph dict build 相当）が dict.json を書き換えたと想定する。
    // サーバーの fs.watch が検知して /watch から dictUpdated を push するはず。
    writeFileSync(
      dictPath,
      dictJson([
        {
          term: 'Sample',
          aliases: [],
          definition: 'SSE 経由で反映された定義。',
          definitionHtml: '<p>SSE 経由で反映された定義。</p>',
          source: 'test',
          sourceRef: '',
        },
      ]),
    );

    // リロードやボタン操作なしで、SSE push → revalidateDict() → ハイライト
    // 再描画が自動的に起きる。
    const term = page.locator('[data-dict-term="Sample"]').first();
    await expect(term).toBeVisible({ timeout: 5000 });
    await term.hover();
    await expect(page.locator('[data-testid="dict-tooltip"]')).toContainText(
      'SSE 経由で反映された定義',
      { timeout: 3000 },
    );
  });
});
