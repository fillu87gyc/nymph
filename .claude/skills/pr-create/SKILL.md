---
name: pr-create
description: PRを作成する。fmt/lint/unit testをローカルで実行し、関連E2Eをdescriptionに記載してPR作成後にCIをモニターしてgreenになるまで担当する。Use when asked to create a PR, open a pull request, or submit changes for review.
---

# create-pr スキル

このスキルは以下を順番に行う：

1. ローカルで fmt / lint / typecheck / unit test を実行し、全部グリーンになるまで修正する
2. 今回の変更に対応する E2E テストを特定し、PR description に記載する
3. **UI 変更がある場合**はスクリーンショットを撮影して GitHub にアップロードし、URL を取得する
4. PR を作成する
5. CI をモニターしてすべてのジョブがグリーンになるまで待機・修正する

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

## Step 2.5 — デモキャプチャ（UI 変更がある場合は必須）

CSS・コンポーネント・レイアウトなど見た目に関わる変更は、**必ずスクリーンショットを撮って PR description に埋め込む**。撮影しないまま PR を作ってはいけない。

### 2.5-a. スクリーンショット撮影

`run-nymph` スキルを使ってアプリを起動・撮影する：

```bash
# フロントエンドを変更した場合は先にビルドが必要
bun run build

# スクリーンショット撮影（/tmp/nymph-demo.png に保存）
bun .claude/skills/run-nymph/driver.mjs tests/fixtures/sample.md \
  --screenshot /tmp/nymph-demo.png
```

変更内容に応じてフィクスチャや操作を調整する（コメント追加後の見た目を確認したいなら `--comment "..."` を付けるなど）。

### 2.5-b. GitHub にアップロードして URL を取得

```bash
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)
FILENAME="demo-$(date +%s).png"

# screenshots タグがなければ作成（初回のみ）
gh release view screenshots &>/dev/null || \
  gh release create screenshots \
    --title "PR Screenshots (auto-generated)" \
    --notes "PR デモスクリーンショット置き場。手動削除しないこと。" \
    --prerelease

# アップロード
cp /tmp/nymph-demo.png "/tmp/${FILENAME}"
gh release upload screenshots "/tmp/${FILENAME}" --name "$FILENAME"

# PR description に使う URL
DEMO_URL="https://github.com/${OWNER}/${REPO}/releases/download/screenshots/${FILENAME}"
echo "DEMO_URL=$DEMO_URL"
```

取得した `$DEMO_URL` を次の Step 3 の `## デモ` セクションに埋め込む。

> **UI 変更がない場合**（ロジック修正・リファクタ・CI 設定など）は `## デモ` セクションごと削除する。

---

## Step 3 — PR 作成

PR の body は以下のテンプレートを使う。`gh pr create` の `--body` に渡す。
`$DEMO_URL` には Step 2.5 で取得した実際の URL を埋め込むこと（プレースホルダーのまま作ってはいけない）。

```
## Summary
- <変更点を箇条書き>

## デモ
![デモ]($DEMO_URL)

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

実際のコマンド例（`DEMO_URL` 変数を使いまわす）：

```bash
gh pr create \
  --title "feat: ..." \
  --body "$(cat <<EOF
## Summary
- ...

## デモ
![デモ](${DEMO_URL})

## E2Eカバレッジ
| テストファイル | シナリオ |
|---|---|
| \`tests/e2e/smoke.test.ts\` | \`smoke: 起動 → コンテンツ表示 > ページが正常に読み込まれる\` — ... |

## Test plan
- [x] \`bun run fmt\` グリーン
- [x] \`bun run lint\` グリーン
- [x] \`bunx tsc --noEmit\` グリーン
- [x] \`bun run test\` グリーン
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
