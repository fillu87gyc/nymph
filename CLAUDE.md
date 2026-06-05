# nymph — Claude 向け開発ガイド

## 開発ポリシー

**TDD を実践してリグレッションに対抗する。**

- Unit test はロジックの単体検証。実装前に書いてよい（TDD）。
- E2E はユーザー視点の動作保証。**完成の定義は E2E がグリーンになった時点。**
- テストのない変更は完成とみなさない。

## 開発フロー

```
1. 既存テスト全グリーン確認（bun run test && bun run build && bun run test:e2e）
2. unit test を書く → 実装（TDD）
3. E2E を書く → bun run build && bun run test:e2e がグリーン
4. ← 完成
```

> **注意**: E2E テストはビルド済み `dist/` を参照する。`bun run test:e2e` の前に必ず `bun run build` を実行すること。

E2E が書けない場合は理由と代替案をユーザーに提示してから完了とする。
省略できるのは実際の動作に影響しない変更のみ（CI 設定・テストコードの修正など）。

## 作業完了前の確認（必須）

ユーザーに次のアクションを求める前に、今回の変更で E2E カバレッジから漏れた部分がないか確認する。漏れがあれば追加してから完了とする。

## E2E の書き方

→ `/e2e-patterns` を参照

**fixture の分類**（新規テスト追加時に意識する）:
- 読み取り専用テスト: `tests/fixtures/readonly.md` を使い、`workers` を増やせる
- ファイル書き込みテスト: `tests/fixtures/sample.md` を使い、`beforeEach`/`afterEach` で必ず復元する

## 新しい API エンドポイントを追加するとき

→ `/new-endpoint` を参照
