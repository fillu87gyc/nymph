# nymph ロードマップ

> スタック: Bun · React 19 · TypeScript · Vite 8  
> 配布: `bunx nymph` / `bun build --compile`
>
> 実装済み機能の一覧 → [docs/features.md](docs/features.md)

---

## 完了（2026-07-21 セッション）

- **Phase 2 — コメントのライフサイクル（PR #115）**: コメント ID を `c_` + 乱数6桁hex に変更（既存整数 ID は非破壊共存）、`resolved`/`createdAt`/`round` を Comment に追加、コメントパネルに All/Open/Resolved フィルタ、チェックポイント設定を「ラウンド境界」として round を採番
- **全文検索（Quick Open 統合）**: mo の `/_/api/search` 相当の `GET /search?q=`（`src/search.ts`）。対象は開いているタブ + ツリー配下の .md で、ファイル名+本文を大文字小文字無視の部分一致で検索。前後1行のコンテキスト付きスニペット（長行はマッチ周辺にクリップしオフセット調整）、ファイルあたり5件・合計50件で打ち切り（`truncated`）。UI は Quick Open（Ctrl/Cmd+P）に「本文の一致」セクションとして統合し、選択すると該当ファイルを開いて対象行を含むブロックへスクロール+フラッシュ。クエリはデバウンス+2文字以上で発火（`useSearch`）

---

## 完了（2026-07-20 セッション）

- **Phase 1 — レビューデータの保存先移転（PR #111）**: コメント/チェックポイントをサイドカー方式から `$XDG_DATA_HOME/nymph/reviews/<key>/{comments.json, checkpoint}` へ移転。`<key>` = `sha256(ファイル絶対パス)` 先頭12桁の決定論的キー（`src/reviewStore.ts` の `reviewKey`）。comments.json は `{version: 2, file, updatedAt, comments}` のエンベロープ。書き込みは temp+rename のアトミック方式。レガシーサイドカーは読み取り/書き込み両経路で自動移行（移動方式・冪等）、破損ファイルは `*.corrupt-<timestamp>` に退避して原本を保全。`src/reviewStore.ts` が唯一の入出力窓口、`src/xdgPaths.ts` が XDG パス解決の共通ヘルパー
- **Stage A — パレット刷新（PR #112）**: ダーク=Tokyo Night 系（crit 由来: bg #0e0f13/#171922, text #c0caf5, accent #85aaf8）、ライト=GitHub Primer 系（mo 由来: #ffffff/#f6f8fa, text #1f2328, accent #0969da）。セマンティック色は `--danger`/`--success`/`--diff-*-bg` と `--*-rgb` に集約。highlight.js は tokyo-night-dark/github。本文フォントのデフォルトは Inter（切替機能と serif 選択肢は維持）
- **Stage B — ツールバー再編（PR #113）**: 常時表示9個+「⋯」オーバーフローメニュー（項目クリックで閉じる）+「⚙」設定ポップオーバー（調整系のため開いたまま）。接続状態と更新時刻はドット1個+ツールチップに統合。FileTabs はファイル2つ以上でのみ表示

---

## 設計原則

crit/mo 調査から得た指針。今後の機能追加でも守る。

- ツールの状態はレビュー対象リポジトリの外（XDG）に置き、対象を汚さない
- ID は採番せずハッシュ導出（決定論的キー）。コンテンツハッシュによる重複排除も同じ思想
- 軽いデータ（コメント）と重いデータ（スナップショット）はファイルを分ける
- 書き込みは常にアトミック（temp+rename）、マイグレーションは冪等に
- UI は「デフォルトで見せない、必要時に出す」。色はセマンティックトークン経由でのみ使う

---

## 次にやること（優先順）

1. **ヘッドレス CLI コメント** — `nymph comment <file>:<line[-end]> "本文"` でブラウザなしにコメント追加・一覧・削除。エージェント連携（Claude Code フック）の深化
2. **その他候補（優先度低）** — frontmatter の折りたたみ表示 / GitHub Alerts 対応 / レビューのコピー形式選択（JSON に加え Markdown/Text）/ stdin パイプ（`cat x.md | nymph`、コンテンツハッシュ重複排除）/ スクロール位置復元・見出しディープリンク

---

## 除外

やらないと決めたもの。

- **KaTeX/TeX 数式プレビュー: 実装しない**（ユーザー判断。2026-07-20）
- 共有（crit share 相当）・GitHub PR 同期: サーバー/認証が絡むため当面スコープ外

---

## 開発運用メモ

- 完成の定義は E2E グリーン（CLAUDE.md）。`bun run test && bun run build && bun run test:e2e`
- VRT: ベースライン PNG は見た目に影響する変更時に**削除して CI 再生成**（`[skip ci]` コミットが自動で積まれる）。ローカルではフォント差でピクセル一致しない（既知）。VRT は `bun run test:e2e` に**含まれない**別構成（`playwright.vrt.config.ts`）なので、UI 挙動を変えたら `bunx playwright test --config playwright.vrt.config.ts` で「ベースライン差分以外の失敗がゼロ」を必ず確認する（PR #113 で横展開漏れの実績あり）
- E2E のレビューデータは `fixtures.ts` の `reviewCommentsPath` 等のヘルパー経由で新store を参照。テスト間の分離のため `reviewDir` を `beforeEach`/`afterEach` で掃除する
- メニュー操作ヘルパー（`openOverflowMenu`/`openSettingsMenu`）の挙動を変える際は `*_vrt.test.ts` を除外せず grep で全対象を列挙すること

---

## 小粒 UX タスク（優先度低・未着手）

| # | 機能 | 優先度 |
|---|------|--------|
| 1 | **キーボードショートカット** — `?` でショートカット一覧表示、`C` でコメントパネル開閉、`T` でテーマ切替 | 中 |
| 2 | **2ファイル diff** — `nymph a.md b.md --diff` で 2 ファイルの追加 / 削除行をハイライト（チェックポイント diff とは別軸） | 中 |
| 3 | **設定ファイル対応** — `.nymph.toml` でポート・テーマ・ポーリング間隔をプロジェクト単位で指定 | 低 |

---

## v0.4 — エクスポート & 出力

**目標:** レビュー結果を別ツールへ流す

| # | 機能 | 優先度 |
|---|------|--------|
| 1 | **HTML エクスポート** — `nymph report.md --export out.html` でコメント埋め込みの静的 HTML を生成 | 高 |
| 2 | **PDF 出力** — 印刷用 CSS を追加し、ブラウザ印刷 API で PDF 生成 | 中 |
| 3 | **コメントを Markdown に書き戻し** — レビューコメントを元ファイルのブロック直下に `> [nymph] …` 形式で挿入するオプション | 中 |
| 4 | **JSON → CSV エクスポート** — 保存済みコメントを CSV に変換する CLI サブコマンド `nymph export` | 低 |

---

## v0.5 — AI 統合

**目標:** AI が生成した Markdown を AI がレビューするループを閉じる

| # | 機能 | 優先度 |
|---|------|--------|
| 1 | **Claude API 連携** — ツールバーに「AI レビュー」ボタン、ファイル内容を Claude に送り自動コメントを挿入 | 高 |
| 2 | **プロンプト付きレビュー** — レビュー観点（整合性チェック / 日本語校正 / 図の妥当性）をプリセット選択 | 中 |
| 3 | **コメントへの AI 返答** — 既存コメントを AI に見せ、修正案を提示させる | 低 |

> 実装時は `ANTHROPIC_API_KEY` が未設定なら AI ボタンを無効化し、外部依存は optional deps に閉じる。

---

## v1.0 — 配布 & エコシステム

**目標:** OSS として広く使われる状態にする

| # | 機能 |
|---|------|
| 1 | **GitHub Actions テンプレート** — PR に Markdown が含まれる場合、nymph で自動レビューを実行して結果をコメントするワークフロー |
| 2 | **VS Code 拡張** — エディタのサイドパネルで nymph プレビューを開く拡張 |
| 3 | **ドキュメントサイト** — GitHub Pages で機能紹介 + スクリーンショットを公開 |
| 4 | **プラグイン API** — カスタムブロックレンダラーを外部パッケージとして追加できる仕組み |

---

## 技術的負債 / インフラ

随時対応する項目。

| 項目 | 内容 |
|------|------|
| テストカバレッジ拡充 | テキスト選択コメント・draw.io ダウンロード・ドラッグ&ドロップ系のコメント保存を E2E でカバー |
| アクセシビリティ | `aria-*` 属性の整備、キーボードのみで全操作できるようにする |

### 完了済み

- **ファイルウォッチ方式の改善**: `handleWatch` を `fs.watch`（Bun 内部で FSEvents / inotify）ベースに切替。500ms ポーリングを廃止し、書き込みは native 通知で即座に SSE emit。安全網として 2s 間隔の stat 比較を残す（fs.watch の取りこぼしと SSE 再接続時の flush race を補償）。既存 E2E ホットリロードテスト全通過。
- **`/edit-op` フック python3 依存の除去**: `.claude/commands/install.md` の hook.sh を `jq` ベースに置換。同一 JSON 入力パターン（`tool_input` ラッパーあり/なし・非 JSON）をカバー。
- **hljs テーマ CSS の同梱**: `src/client/App.tsx` の CDN 直リンクを `import '?url'` に変更し `dist/assets/{tokyo-night-dark,github}.min-<hash>.css` として bundle。オフライン利用可・E2E の CDN mock 撤去。
- **セキュリティ / `--host` フラグ**: デフォルト loopback（127.0.0.1）を維持しつつ、`--host` で LAN 公開を opt-in 化。値なしは `0.0.0.0`、`--host <addr>` で明示指定可。非 loopback バインド時は警告表示。

---

## 優先順位の考え方

```
完了: npm 公開 → データ移転 (Phase 1) → UX 刷新 (Stage A/B)
      → Phase 2 コメントライフサイクル → 全文検索
                                          ↓ 現在ここ
次にやる: ヘッドレス CLI
                                          ↓
出力強化 (v0.4) → AI 統合 (v0.5) → エコシステム (v1.0)
```

各マイルストーンは独立しており、どこからでも着手できます。  
フィードバックや優先度の変更があれば随時このファイルを更新してください。
