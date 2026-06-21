---
name: run-nymph
description: Run, screenshot, and drive the nymph app. Use when asked to run nymph, start the app, take a screenshot, verify a change works visually, or test a feature in the real browser.
---

# run-nymph

nymph は Bun サーバー（ポート 6276）+ React フロントエンドの Web アプリ。
`dist/` をビルド済みの状態で `bun run src/cli.ts` で起動し、Playwright Chromium（headless）で駆動する。

ドライバスクリプト: `.claude/skills/run-nymph/driver.mjs`（`bun` で実行）

## Prerequisites

```bash
bun install
bun run build        # dist/ が必要（未ビルドなら起動しても空白ページになる）
```

Chromium は `playwright.config.ts` / `playwright.vrt.config.ts` が `PLAYWRIGHT_BROWSERS_PATH` 配下のプリセット済みバイナリを自動検出して使う（`driver.mjs` は Playwright のデフォルト解決ロジック経由で同じ場所を見つける）。
**`bunx playwright install chromium` は実行しない**: ブラウザダウンロード先への通信がこのサンドボックスでブロックされており、毎回失敗してアラートになる。`ls $PLAYWRIGHT_BROWSERS_PATH` でプリセットの有無を確認し、無い場合のみユーザーに相談する。

## Run（エージェント用）

```bash
# スクリーンショットのみ
bun .claude/skills/run-nymph/driver.mjs tests/fixtures/sample.md --screenshot /tmp/out.png

# コメントを追加してスクリーンショット
bun .claude/skills/run-nymph/driver.mjs tests/fixtures/sample.md \
  --comment "確認したいコメント" \
  --screenshot /tmp/out.png

# 任意の .md ファイルで起動
bun .claude/skills/run-nymph/driver.mjs path/to/file.md --screenshot /tmp/out.png
```

出力例:
```
nymph on http://localhost:6276
comment added
screenshot → /tmp/out.png
active: /path/to/file.md
```

## Run（人間用）

```bash
bun run src/cli.ts README.md    # ブラウザが自動で開く
# Ctrl+C で停止
```

## E2E テスト

```bash
bun run test:e2e    # Playwright、workers: 1（シリアル実行）
```

## Gotchas

- **`node` では動かない**: `playwright` パッケージの解決に `bun` が必要。必ず `bun driver.mjs` で実行する。
- **`dist/` が古いと空白ページ**: フロントエンドを変更したら `bun run build` してからドライバを動かす。開発中は代わりに `bun run dev`（Vite HMR）を使う。
- **ポート衝突**: 6276 が使用中の場合は 6277 以降に自動で移る。lock ファイル（`<file>.nymph-lock`）に実際のポートが書き込まれる。ドライバは stdout からポートを読むので問題なし。
- **前回の `.comments.json` が残る**: ドライバは comments を消さない。E2E テストは `beforeEach` で削除しているが、ドライバ経由で動かす場合は手動削除が必要な場合がある。
- **`bun run dev` との共存**: `bun run dev` が 6276 を使っている場合、ドライバは別ポートで起動する。
