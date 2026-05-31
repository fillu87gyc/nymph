# E2E パターン集

Playwright で書きにくい操作のパターン集。

## ドラッグ＆ドロップ（File オブジェクト付き）

ブラウザの `DataTransfer` に `File` を載せて `drop` イベントを発火する。

```typescript
const dataTransfer = await page.evaluateHandle(
  ({ name, content }: { name: string; content: string }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([content], name, { type: 'text/plain' }));
    return dt;
  },
  { name: 'hello.md', content: '# Hello\n' },
);
await page.dispatchEvent('body', 'dragover', { dataTransfer });
await page.dispatchEvent('body', 'drop', { dataTransfer });
```

## SSE（ファイル書き換えによるホットリロード）

サーバーが監視しているファイルを `writeFileSync` で直接書き換えて、DOM が更新されるのを待つ。
`afterEach` で必ず元に戻すこと。

```typescript
import { writeFileSync } from 'node:fs';

const FIXTURE = join(process.cwd(), 'tests/fixtures/sample.md');
const ORIGINAL = readFileSync(FIXTURE, 'utf-8');

test.afterEach(() => writeFileSync(FIXTURE, ORIGINAL));

test('SSE でコンテンツが更新される', async ({ page }) => {
  await page.goto('/');
  writeFileSync(FIXTURE, '# Updated\n');
  await expect(page.locator('#content h1')).toContainText('Updated', { timeout: 5000 });
});
```

## コメントの追加（共通ヘルパー）

```typescript
async function addComment(page: Page, text: string) {
  const block = page.locator('#content .md-block').first();
  await block.hover();
  await block.locator('.comment-btn').click();
  await page.locator('#comment-ta').fill(text);
  await page.locator('#btn-submit').click();
  await expect(page.locator('.comment-item').first()).toBeVisible({ timeout: 3000 });
}
```

## fixture の使い分け

| 用途 | fixture | workers |
|------|---------|---------|
| 読み取り専用（表示確認など） | `tests/fixtures/readonly.md` | 並列可（workers: 上限なし） |
| ファイル書き込みあり | `tests/fixtures/sample.md` | 直列必須（beforeEach/afterEach で復元）|

読み取り専用テストを別プロジェクトに切り出す例（`playwright.config.ts`）:

```typescript
projects: [
  {
    name: 'readonly',
    testMatch: '**/readonly-*.test.ts',
    use: { baseURL: 'http://localhost:6277' },
    // 専用サーバーを立てて並列化
  },
  {
    name: 'write',
    testMatch: ['**/comments.test.ts', '**/diff.test.ts', '**/smoke.test.ts'],
    // workers: 1 のまま
  },
],
```

## トースト表示の確認

トーストは表示後に消えるため、`toBeVisible` だけでなく `toContainText` で素早く検証する。

```typescript
await expect(page.locator('#toast')).toContainText('更新されました', { timeout: 3000 });
```
