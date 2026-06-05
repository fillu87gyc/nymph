# ユビキタス言語辞書 — 設計ロードマップ

> ステータス: **設計フェーズ（実装前）**
> このドキュメントは「どこで・どう thyrs.yml を扱い、どう責務を分けるか」を整理し、
> 段階実装のロードマップを定義する。コードはまだ書かない。

---

## 1. 目的

Markdown で書かれたユビキタス言語（用語集）を **辞書化** し、thyrs で Markdown を
レビューしているときに **用語にマウスホバーすると定義が引ける** ようにする。

辞書のソースは GitHub 上にあることも、ローカルにあることもある。どこから・どんな
コマンドで取得するかは設定ファイル（`thyrs.yml`）に書け、thyrs 側には強制フェッチ
ボタンと「1 日 1 回 / `updatedAt` が古いときだけ取りに行く」自動更新を持たせる。

これにより、辞書の実体は **永続化された `dict.json`** に集約され、thyrs 本体は
インメモリ管理から脱却する。

---

## 2. 全体像と責務分割

辞書化は **4 つのアーティファクト** と **3 つの責務レイヤ** に分ける。
各レイヤの境界は「ファイル」で、前後を疎結合に保つ。

```
                    ┌──────────────┐
   thyrs.yml  ──────│  ① Fetch     │──── raw cache（取得した生ソース + メタ）
  （宣言的設定）       │   レイヤ       │      .thyrs/cache/<source>.raw
                    └──────────────┘            │
                                                ▼
                    ┌──────────────┐
   thyrs.yml  ──────│  ② Convert   │──── dict.json（thyrs が解釈できる正準形式）
  （構造 DSL）         │  (Adapter)   │      .thyrs/dict.json
                    └──────────────┘            │
                       ▲ injectable             ▼
                    markdown / json / csv …
                                                ▼
                    ┌──────────────┐
                    │  ③ thyrs     │──── ホバーで定義表示 / 強制フェッチボタン
                    │  (server+UI) │      dict.json **だけ** を読む
                    └──────────────┘
```

| # | レイヤ | 入力 | 出力 | 責務 |
|---|--------|------|------|------|
| ① | **Fetch** | `thyrs.yml` の `fetch` 指定 | 生ソース + `updatedAt` | ソースをどこからどう取るか。`cat`（ローカル）/ `gh`（GitHub）等。TTL 判定もここ。 |
| ② | **Convert（Adapter）** | 生ソース + `thyrs.yml` の構造 DSL | `dict.json` | 各表現（markdown / json / csv …）を正準形式へ変換する **緩衝材**。injectable。 |
| ③ | **thyrs** | `dict.json` | ホバー辞書 UI | 辞書の中身を**読むだけ**。ソースの場所も構造 DSL も知らない。 |

### この分割が効く理由

- **dict.json が唯一の境界契約**。thyrs 本体は yml も markdown 構造も fetch コマンドも
  知らない。ソース表現が増えても（json / csv / Notion エクスポート…）thyrs は無改修。
- **インメモリ脱却**: 辞書は `dict.json` に永続化され、`updatedAt` で鮮度管理。
  プロセス再起動でも状態が消えない。
- **セキュリティ境界が明確**（→ §4）。任意コマンド実行は ① に閉じ込め、
  ③ の HTTP サーバ（ループバック・no-shell の現行ポリシー）を汚さない。

---

## 3. thyrs.yml をどこで・どう扱うか

> 回答③「yml をそもそもどこでどう扱うのか整理したい」への回答。

### 置き場所

- プロジェクトルートの `thyrs.yml`（thyrs を起動するカレントディレクトリで探索）。
- 既存 ROADMAP の `.thyrs.toml` 構想とは別物。辞書専用の宣言を持つので YAML を採用
  （ネストした構造 DSL と相性が良い）。将来、汎用設定と統合する余地は残す。

### 誰が読むか — 「2 つの実行主体」を分離

`thyrs.yml` を読む主体は **2 つに分ける**。これが責務整理の肝。

1. **`thyrs dict` サブコマンド（CLI / ビルド時）** — ① Fetch と ② Convert を実行。
   yml をフルに解釈し、必要なら外部コマンド（`gh` 等）を起動して `dict.json` を生成する。
   **危険な操作（コマンド実行）はここに閉じ込める。**

   ```
   thyrs dict build      # fetch + convert を一度実行して dict.json を更新
   thyrs dict build --debug   # 中間生成物（raw cache, パース木, マッチ結果）を吐く
   ```

2. **`thyrs`（HTTP サーバ / 常駐）** — `dict.json` を読むだけ。
   強制フェッチボタンが押されたら、サーバは **`thyrs dict build` を子プロセスとして
   spawn する**（自前で yml を eval しない）。完了後 `dict.json` を再読込して SSE で通知。

```
ブラウザ［強制フェッチ］
   │ POST /dict/sync
   ▼
thyrs server ── spawn ──▶ `thyrs dict build`（① + ②）──▶ dict.json 更新
   │                                                          │
   └──────────────── 再読込 + SSE 通知 ◀──────────────────────┘
```

このため `dict.json` の生成（信頼境界の外側に触れる）と消費（ループバック HTTP）が
プロセスとして分かれ、現行のセキュリティポリシーを崩さない。

### デバッグ（要件「デバッグも含め」）

`thyrs dict build --debug` で各段の中間生成物を `.thyrs/debug/` に出力する。

- `raw/<source>.md` — fetch した生ソース
- `tree/<source>.json` — markdown を木構造化した中間表現（§5 の tree）
- `match/<source>.json` — セレクタが何にマッチしたか（用語/定義の対応）
- `dict.json` — 最終結果

これにより「セレクタが意図通り当たっているか」を thyrs を起動せず検証できる。

---

## 4. セキュリティ — fetch コマンドの扱い

> 回答③に紐づく論点。現行 thyrs はサーバをループバック固定・shell 非経由で運用している。

方針: **任意コマンドは `thyrs dict` サブコマンド（明示的なユーザ操作）に限定し、
HTTP リクエストハンドラから直接 shell を叩かない。**

- `thyrs.yml` の `fetch.cmd` は **argv 配列**で書く（shell 文字列ではない）。
  `spawnSync(cmd[0], cmd.slice(1), { shell: false })` で実行 → シェルインジェクション面を残さない。

  ```yaml
  fetch:
    cmd: ["cat", "docs/glossary.md"]          # ローカル
  # cmd: ["gh", "api", "repos/org/repo/contents/glossary.md", "--jq", ".content"]  # GitHub
  ```

- glob が必要なケース（`docs/lang/*.md`）は、shell に頼らず thyrs 側の `Glob`
  （`cli.ts` 既存）で展開してから複数ソースとして扱う。`["sh","-c", ...]` をユーザが
  明示的に書くことは妨げないが、推奨はしない。
- 強制フェッチボタン → サーバは固定的に `thyrs dict build` を spawn するだけ。
  リクエストボディからコマンドを受け取って実行することは **しない**。
- README に「`thyrs.yml` の `fetch.cmd` はローカルの信頼された設定であり、
  thyrs を起動するユーザと同じ権限で実行される」旨を明記する。

---

## 5. 構造 DSL — CSS セレクタ風

> 回答②「スクレイピングしてくるので表現力大事。CSS のセレクタみたいな書き方」への回答。

### 5.1 Markdown を木構造に写す

Markdown は DOM ではないが、**見出しが入れ子を作る木**とみなせばセレクタが効く。

ルール:
- `h1`〜`h6` は深さに応じてネストする（`h2` は直前の `h1` の子）。
- ある見出しから「次の同レベル以上の見出し」までの間にあるブロック
  （`p` / `li` / `code` / `blockquote` / `table` …）は、その見出しの **子** とする。

例）

```markdown
## ユビキタス言語        ← h2
### 集約                ← h3（h2 の子）
集約とは…               ← p（h3 の子）
### リポジトリ           ← h3（h2 の子）
リポジトリとは…          ← p（h3 の子）
```

これを木にすると：

```
h2「ユビキタス言語」
├─ h3「集約」
│   └─ p「集約とは…」
└─ h3「リポジトリ」
    └─ p「リポジトリとは…」
```

`marked.lexer` のトークン（depth 付き見出し含む）から、この木を構築する
（既存 `parseBlocks` / `assignLines` の延長で実装可能）。

### 5.2 セレクタ方言

CSS のサブセット + Markdown 向けの最小拡張。

| 構文 | 意味 |
|------|------|
| `h1`..`h6`, `p`, `li`, `code`, `blockquote`, `table`, `*` | 要素型セレクタ |
| `:contains('テキスト')` | 見出し/段落テキストの部分一致 |
| `A > B` | 子（直下のネスト：見出し木での親子） |
| `A + B` | 直後の隣接（同じ親の下で A の直後の要素） |
| `A ~ B` | A 以降の兄弟（次の見出しまでの後続ブロック） |
| `A B`（空白） | 子孫（A の配下すべて） |

各ソースは **`term`（用語ノード）** と **`definition`（定義ノード）** の 2 つの
セレクタを宣言する。`definition` は `term` を起点に相対解決する。

### 5.3 要件の 2 ケースを記述する

**ケース A**: 「`## ユビキタス言語` の下の `###` がタイトル、その下が説明」

```yaml
sources:
  - name: glossary
    fetch:
      cmd: ["cat", "docs/glossary.md"]
    adapter: markdown
    rules:
      term: "h2:contains('ユビキタス言語') > h3"   # 用語見出し
      definition: "term > p"                       # その直下の段落
```

**ケース B**: 「`/docs/lang/*.md` の第 2 見出しをタイトルにする」

```yaml
sources:
  - name: lang-docs
    fetch:
      cmd: ["cat", "docs/lang/*.md"]   # glob は thyrs 側で展開（§4）
    adapter: markdown
    rules:
      term: "h2"            # 第 2 見出し = タイトル
      definition: "term ~ *"  # 次の h2 までの後続ブロック全部
```

`definition` が複数ブロックに当たる場合は連結して 1 定義にする（HTML も生成）。

---

## 6. dict.json — 正準スキーマ（境界契約）

thyrs が読む唯一の形式。Adapter の出力 = thyrs の入力。

```json
{
  "version": 1,
  "updatedAt": "2026-06-03T12:00:00.000Z",
  "entries": [
    {
      "term": "集約",
      "aliases": ["Aggregate"],
      "definition": "集約とは…（プレーンテキスト）",
      "definitionHtml": "<p>集約とは…</p>",
      "source": "glossary",
      "sourceRef": "docs/glossary.md#L12"
    }
  ]
}
```

- `term` / `aliases`: ホバー時のマッチに使う（別名も引ける）。
- `definition` / `definitionHtml`: ツールチップ表示用。HTML は既存 `sanitizeHtml` を通す。
- `updatedAt`: TTL 判定（§7）に使う。
- `sourceRef`: 出典ジャンプ（将来）。

---

## 7. 鮮度管理 — TTL / updatedAt / 強制フェッチ

- **強制フェッチボタン**（Toolbar）: `POST /dict/sync` → `thyrs dict build` を spawn。
- **自動更新（デフォルト 1 日 1 回）**: thyrs 起動時とポーリング時に
  `now - dict.updatedAt > ttl`（既定 24h）なら自動 sync。`ttl` は `thyrs.yml` で上書き可。
- **`updatedAt` 比較**: ソース側にも更新時刻があるなら（`gh` の commit 日時等）、
  ソースが dict より新しいときだけ convert する最適化を ① で行える（将来拡張）。

```yaml
dict:
  ttl: 24h        # 省略時 24h
  out: .thyrs/dict.json
```

---

## 8. thyrs 側のホバー UI

- サーバ: `GET /dict` で `dict.json` を返す（`/comments` パターン踏襲）。
  `POST /dict/sync` で再生成。`/watch` SSE に dict 更新通知を相乗り。
- クライアント: `useDict()` フック（SWR、`useComments` パターン踏襲）。
- 用語ハイライト: entries（term + aliases）からマッチャを構築し、レンダリング済み
  Markdown 内の語にマーキング。実装は **CSS Custom Highlight API**（既存の選択
  ハイライトで実績あり）を優先し、DOM 書き換えを避ける。
- ホバー: 用語上で定義ツールチップを表示。位置決めは既存 `SelectionPopup` /
  コメントアンカー popup のロジックを流用。
- 強制フェッチボタンを Toolbar に追加。

---

## 9. injectable Adapter

② Convert を差し替え可能にする「緩衝材」。将来 `json → dict.json` 等を足せる。

```ts
export interface DictAdapter {
  name: string; // "markdown" | "json" | "csv" | ...
  // 生ソース + yml の rules → 正準 entries
  extract(raw: string, rules: SourceRules): DictEntry[];
}
```

- レジストリに登録し、`thyrs.yml` の `adapter:` で選択。
- 初期実装は `markdown`（§5 のセレクタエンジン）。
- 将来 `json`（JSONPath 風 rules）/ `csv`（列マッピング）を追加しても
  dict.json 契約は不変 → thyrs 無改修。

---

## 10. 段階ロードマップ

> 開発ポリシー（CLAUDE.md）に従い、各フェーズは **unit（TDD）→ 実装 → E2E グリーン**
> で完成とする。E2E が書けない層は理由と代替を明記。

### Phase 0 — 設計（本ドキュメント）✅
責務分割・DSL・スキーマ・セキュリティ境界の合意。

### Phase 1 — Convert コア（MVP の心臓）
- `thyrs.yml` パース（YAML 依存を追加）。
- Markdown → tree（§5.1）。
- CSS セレクタ風エンジン（§5.2）。
- `markdown` Adapter → `dict.json`。
- `thyrs dict build`（ローカル `cat` のみ）+ `--debug`。
- **テスト**: セレクタエンジンとアダプタの unit を厚く（TDD）。E2E は CLI の
  入出力スナップショット（yml + 固定 md → 期待 dict.json）。

### Phase 2 — thyrs 消費 + ホバー UI
- `GET /dict` / `useDict()` / 用語ハイライト / ホバーツールチップ。
- **テスト**: フック・コンポーネント unit。**E2E（完成の定義）**: 辞書を読み込み、
  用語にホバー → 定義ツールチップが出ることを Playwright で確認。

### Phase 3 — Fetch レイヤ + 鮮度管理
- argv 形式 fetch 実行（`gh` 等）、glob 展開、TTL / `updatedAt`、
  強制フェッチボタン → `POST /dict/sync` → spawn。
- **テスト**: fetch は argv をモックした unit。E2E: 強制フェッチボタンで dict が
  更新されることを確認（fetch は `cat` 固定の fixture で）。

### Phase 4 — injectable Adapter レジストリ ✅
- Adapter インターフェース確定 + レジストリ。`json` を追加して差し替え可能性を実証。
- **テスト**: 新アダプタの unit（16 件）+ 既存 dict.json 契約の回帰（E2E 6 件追加）。

---

## 11. オープンな論点（実装前に詰める）

- YAML パーサ依存の選定（`yaml` パッケージ等）。bundle/配布への影響確認。
- 用語マッチの粒度（完全一致 / 形態素 / 大文字小文字・送り仮名揺れ）。日本語の
  部分一致は誤爆しやすいので初期は「entries の語の完全境界一致」から。
- `dict.json` / `.thyrs/` の `.gitignore` 方針（生成物をコミットするか）。
- 複数ソースの用語衝突時のマージ規則（後勝ち / ソース優先度）。
- 強制フェッチ中の UI 状態（多重起動防止・進捗表示）。
