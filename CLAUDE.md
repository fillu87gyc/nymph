# nymph — Claude 向け開発ガイド

## 開発フロー（必須）

**完成の定義 = 既存テスト全グリーン + 新機能の E2E がフリーキーなく通ること。**

```
1. 既存テスト全グリーン確認
   bun run test          # 単体 + コンポーネント
   bun run test:e2e      # E2E

2. 実装

3. 新機能の E2E を書いて通す
   bun run test:e2e

4. ← ここが完成
```

### E2E の原則

- **すべての新機能・バグ修正に E2E シナリオを追加する。**
- E2E が書けない場合は、理由と代替案をユーザーに提示してから実装を完了とする。
- E2E を省略してよいのは「実際の動作に影響しない変更」のみ（テストコードの修正、GitHub Actions の設定変更など）。
- E2E がない状態でリグレッションが起きることを絶対に防ぐ。

### E2E の実行環境

```
bun run test:e2e
```

- `playwright.config.ts` が `tests/fixtures/sample.md` を引数に nymph を起動する
- `baseURL: http://localhost:6276`
- workers: 1（SSE 競合防止のためシリアル実行）

### ドラッグ＆ドロップの E2E

Playwright で `dataTransfer` に `File` オブジェクトを載せるには以下のパターンを使う：

```typescript
const dataTransfer = await page.evaluateHandle(() => {
  const dt = new DataTransfer();
  const file = new File(['# Hello\n'], 'hello.md', { type: 'text/plain' });
  dt.items.add(file);
  return dt;
});
await page.dispatchEvent('body', 'drop', { dataTransfer });
```

## コマンド

```bash
bun run dev        # API(:6276) + Vite HMR(:5173) 同時起動
bun run test       # Vitest（単体 + コンポーネント）
bun run test:e2e   # Playwright E2E
bun run build      # dist/ に本番ビルド（bunx nymph 用）
bun run lint       # Biome チェック
bun run fmt        # Biome フォーマット
```

## 新しい API エンドポイントを追加するとき

1. `src/server.ts` にハンドラを追加
2. `vite.config.ts` の `proxy` に追加（開発時の HMR プロキシ）
3. `src/client/hooks/` の対応フックを更新
4. E2E を追加して動作確認

## dist/ について

`bunx nymph` は `dist/` をサーブする。フロントエンド変更後は必ず：

```bash
bun run build
```

開発中は `bun run dev`（Vite HMR）を使えばビルド不要。
