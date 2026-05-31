---
name: create-pr
description: PRを作成する。fmt/lint/unit testをローカルで実行し、関連E2Eをdescriptionに記載してPR作成後にCIをモニターしてgreenになるまで担当する。Use when asked to create a PR, open a pull request, or submit changes for review.
---

# create-pr スキル

このスキルは以下を順番に行う：

1. ローカルで fmt / lint / typecheck / unit test を実行し、全部グリーンになるまで修正する
2. 今回の変更に対応する E2E テストを特定し、PR description に記載する
3. PR を作成する
4. CI をモニターしてすべてのジョブがグリーンになるまで待機・修正する

---

## Step 1 — ローカルチェック（全部グリーン必須）

以下を順番に実行する。エラーがあれば修正してから次へ進む。

```bash
# 1-a. フォーマット（自動修正）
bun run fmt

# 1-b. lint（biome check）
bun run lint

# 1-c. 型チェック
bunx tsc --noEmit

# 1-d. ユニットテスト
bun run test
```

`bun run fmt` で差分が出た場合は、その変更もコミットに含める。

---

## Step 2 — 関連 E2E テストの特定

変更したファイルと E2E テストを突き合わせて、今回の開発に関連するテストを列挙する。

```bash
# 変更ファイルを確認
git diff --name-only main...HEAD

# E2E テストの describe/test 名を一覧
grep -rn "test.describe\|test(" tests/e2e/ --include="*.ts"
```

E2E テストファイルとカバーするシナリオの対応表：

| ファイル | カバーするシナリオ |
|---|---|
| `tests/e2e/smoke.test.ts` | 起動・コンテンツ表示・コネクションバッジ・SSE再描画 |
| `tests/e2e/comments.test.ts` | コメント追加・パネル開閉・リロード後復元 |
| `tests/e2e/diff.test.ts` | チェックポイント・diff表示（変更ブロック・ins/del） |
| `tests/e2e/drawio.test.ts` | draw.io モーダル開閉・コンテンツ表示 |
| `tests/e2e/scroll_highlight.test.ts` | スクロール連動・highlighted CSSクラス |
| `tests/e2e/selection.test.ts` | テキスト選択 popup・コメントモーダル起動 |
| `tests/e2e/theme_portal.test.ts` | hljs テーマ link portal・テーマ切替・localStorage永続化 |

---

## Step 3 — PR 作成

PR の body は以下のテンプレートを使う。`gh pr create` の `--body` に渡す。

```
## Summary
- <変更点を箇条書き>

## E2Eカバレッジ
<!-- 今回の開発に対応するE2Eテストを列挙する -->
| テストファイル | シナリオ |
|---|---|
| `tests/e2e/XXX.test.ts` | `describe名 > test名` — シナリオ説明 |

## Test plan
- [ ] `bun run fmt` グリーン
- [ ] `bun run lint` グリーン
- [ ] `bunx tsc --noEmit` グリーン
- [ ] `bun run test` グリーン
- [ ] CI 全ジョブ グリーン

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

実際のコマンド例：

```bash
gh pr create \
  --title "feat: ..." \
  --body "$(cat <<'EOF'
## Summary
- ...

## E2Eカバレッジ
| テストファイル | シナリオ |
|---|---|
| `tests/e2e/smoke.test.ts` | `smoke: 起動 → コンテンツ表示 > ページが正常に読み込まれる` — ... |

## Test plan
- [x] `bun run fmt` グリーン
- [x] `bun run lint` グリーン
- [x] `bunx tsc --noEmit` グリーン
- [x] `bun run test` グリーン
- [ ] CI 全ジョブ グリーン

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Step 4 — CI モニタリング

PR 作成直後から CI が完了するまでポーリングする。

```bash
# 現在の PR の CI ステータスを確認
gh pr checks

# 失敗したジョブのログを確認
gh run list --branch "$(git branch --show-current)" --limit 5
gh run view <run-id> --log-failed
```

CI ジョブは5つ：`typecheck` / `lint` / `build` / `unit` / `e2e`

- 失敗したジョブのログを確認し、ローカルで再現・修正してプッシュする
- 全ジョブがグリーンになったら完了を報告する

### E2E 失敗時の追加確認

E2E が CI で失敗した場合は trace アーティファクトを確認する：

```bash
gh run download <run-id> --name e2e-traces
```

---

## CI ジョブ一覧（`.github/workflows/ci.yml` より）

| ジョブ名 | 内容 | ローカル再現コマンド |
|---|---|---|
| `typecheck` | `tsc --noEmit` | `bunx tsc --noEmit` |
| `lint` | Biome check | `bun run lint` |
| `build` | `vite build` | `bun run build` |
| `unit` | vitest + coverage | `bun run test:coverage` |
| `e2e` | Playwright | `bun run test:e2e` |

E2E は `build` ジョブの成果物（`dist/`）に依存するため、ローカルで `bun run build` してから `bun run test:e2e` を実行する。
