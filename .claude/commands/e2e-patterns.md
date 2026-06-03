# E2E パターン集

Playwright で書きにくい操作のパターン集。

## fixture の使い分け（並列化の前提）

E2E は `workers: 4` で並列実行される。各ワーカーは専用サーバー・専用 fixture コピー・専用ポートを持つ（`tests/e2e/fixtures.ts` が自動管理）。

**テストファイルは必ず `./fixtures.ts` から import すること。**  
`@playwright/test` から直接 import すると、そのテストだけワーカー分離が効かなくなる。

```typescript
// ✅ 正しい
import { expect, test } from './fixtures.ts';

// ❌ 禁止 — ワーカー分離が壊れる
import { expect, test } from '@playwright/test';
```

`test` と `expect` に加えて `Page` 型も `./fixtures.ts` から re-export されている。

```typescript
import { expect, test, type Page } from './fixtures.ts';
```

### fixture パラメータ

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `fixturePath` | `string` | ワーカー専用の markdown ファイルパス |
| `commentsPath` | `string` | `fixturePath + '.comments.json'` |
| `page` | `Page` | そのワーカーのポートに向いた `baseURL` 付き |

### beforeEach / afterEach でのファイル操作

```typescript
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

// ORIGINAL はモジュールスコープで読んでよい（読み取り専用）
const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

test.beforeEach(async ({ page, fixturePath, commentsPath }) => {
  writeFileSync(fixturePath, ORIGINAL);  // ← FIXTURE ではなく fixturePath
  rmSync(commentsPath, { force: true });
  await page.goto('/');
});

test.afterEach(async ({ fixturePath, commentsPath }) => {
  writeFileSync(fixturePath, ORIGINAL);
  rmSync(commentsPath, { force: true });
});
```

### テスト内でのファイル書き込み

テスト関数の引数で `fixturePath` / `commentsPath` を受け取る。

```typescript
test('SSE で更新される', async ({ page, fixturePath }) => {
  writeFileSync(fixturePath, '# New\n');
  await expect(page.locator('#content h1')).toContainText('New', { timeout: 5000 });
});
```

### ヘルパー関数にファイルパスを渡す

モジュール外から fixture パスにアクセスできないため、ヘルパー関数はパスを引数として受け取る設計にする。

```typescript
// ✅ 引数で受け取る
async function setupDiff(page: Page, fixturePath: string) {
  writeFileSync(fixturePath, BEFORE_CONTENT);
  // ...
}

test('diff test', async ({ page, fixturePath }) => {
  await setupDiff(page, fixturePath);
});
```

---

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
import { expect, test } from './fixtures.ts';

const ORIGINAL = readFileSync(join(process.cwd(), 'tests/fixtures/sample.md'), 'utf-8');

test.afterEach(async ({ fixturePath }) => writeFileSync(fixturePath, ORIGINAL));

test('SSE でコンテンツが更新される', async ({ page, fixturePath }) => {
  await page.goto('/');
  writeFileSync(fixturePath, '# Updated\n');
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

## トーストの確認

トーストは表示後に消えるため、`toContainText` で素早く検証する。

```typescript
await expect(page.locator('#toast')).toContainText('更新されました', { timeout: 3000 });
```
