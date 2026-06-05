# dict — 用語辞書ビルダー

Markdown や JSON から用語とその定義を抽出し、統一された JSON 辞書ファイル（`dict.json`）を生成するモジュール。

## nymph.yml の置き場所

プロジェクトルートに `nymph.yml` を置く。`--config` オプションで別パスを指定することもできる。

```
myproject/
├── docs/
│   └── glossary.md
└── .nymph/
    ├── config.yml     ← ここ（デフォルト）
    └── dict.json      ← 出力先（デフォルト）
```

---

## nymph.yml の構造

```yaml
sources:
  - name: <ソース識別子>        # dict.json の source フィールドに入る
    fetch:
      cmd: [<コマンド>, <引数>, ...]  # 標準出力に原文を吐くコマンド
    adapter: markdown             # "markdown" または "json"
    rules:
      term: "<セレクタ>"          # 用語ノードを選ぶセレクタ
      definition: "term <op> <セレクタ>"  # term を起点にした定義ノードの相対セレクタ
      aliases: "term <op> <セレクタ>"    # （省略可）"term" 指定で括弧・ハイフン・コロン記法から自動抽出

dict:
  ttl: "24h"                     # キャッシュ有効期限（省略可。例: "1h", "30m"）
  out: ".nymph/dict.json"        # 出力パス（省略可）
```

`fetch.cmd` はシェルを介さず直接 spawn される。glob パターン（`*`, `?`）を含む引数はファイルに展開される。

---

## Markdown アダプタ

### 対応する Markdown 構造

見出し（`h1`〜`h6`）を軸に木構造が構築される。非見出しブロックは直近の見出しの子になる。

```markdown
# ドメイン用語集               ← h1 (ルート)

## ユビキタス言語               ← h2 (h1 の子)

### 集約（Aggregate）          ← h3 (h2 の子)

集約とは、整合性を保つべきオブジェクトの集まりである。  ← p (h3 の子)

### リポジトリ                 ← h3 (h2 の子)

リポジトリとは、集約の永続化と再構築を担う。          ← p (h3 の子)

## その他                      ← h2 (h1 の子)

### エンティティ               ← h3 (h2 の子)

エンティティとは、同一性を持つドメインオブジェクトである。
```

上記は次の木として扱われる：

```
h1: ドメイン用語集
├─ h2: ユビキタス言語
│  ├─ h3: 集約（Aggregate）
│  │  └─ p: 集約とは…
│  └─ h3: リポジトリ
│     └─ p: リポジトリとは…
└─ h2: その他
   └─ h3: エンティティ
      └─ p: エンティティとは…
```

対応するノード型：`h1` `h2` `h3` `h4` `h5` `h6` `p` `li` `code` `blockquote` `table`

リストのネスト構造（`li > li`）も対応している。

```markdown
## 集約

* コードの中の名前
  * Aggregate
* 説明
  * 集約とは、整合性を保つべきオブジェクトの集まりである。
```

上記は次の木として扱われる：

```
h2: 集約
├─ li: コードの中の名前
│  └─ li: Aggregate
└─ li: 説明
   └─ li: 集約とは…
```

### セレクタ構文

#### 型セレクタ

ノードの型で絞り込む。

| セレクタ | 意味 |
|---|---|
| `h2` | h2 ノード |
| `p` | 段落ノード |
| `li` | リスト項目ノード |
| `code` | コードブロックノード |
| `blockquote` | 引用ブロックノード |
| `table` | テーブルノード |
| `*` | 任意のノード |

#### 疑似クラス

| セレクタ | 意味 |
|---|---|
| `h2:contains('テキスト')` | `text` フィールドに指定文字列を含む h2 |
| `h3:has-alias` | エイリアス記法（括弧・ハイフン・コロン）を含む h3 |
| `h3:alias('テキスト')` | 抽出されるエイリアスに指定文字列を含む h3（部分一致） |

`'` と `"` の両方が使える。部分一致。

`:has-alias` と `:alias()` はエイリアス自動抽出と同じ 3 種の記法（括弧・ハイフン・コロン）をすべて検出する。

```yaml
# エイリアスを持つ h3 だけを用語として選択
rules:
  term: "h3:has-alias"
  definition: "term > p"
```

```yaml
# 括弧内に "Aggregate" を含む h3 だけを選択
rules:
  term: "h3:alias('Aggregate')"
  definition: "term > p"
```

#### コンビネータ

| 記法 | 名前 | 意味 |
|---|---|---|
| `A > B` | 子 | A の直接の子のうち B にマッチするもの |
| `A B` | 子孫 | A の子孫（任意の深さ）のうち B にマッチするもの |
| `A + B` | 隣接兄弟 | A の直後の兄弟で B にマッチするもの |
| `A ~ B` | 後続兄弟 | A より後ろの兄弟全員で B にマッチするもの |

#### 相対セレクタ（definition / aliases 共通）

`rules.definition` と `rules.aliases` では `term` をアンカーとして対象ノードを指定する。
コンビネータを連鎖させた多段パスも使用できる。

| セレクタ | 意味 |
|---|---|
| `term > p` | マッチした term ノードの直接子 p |
| `term p` | マッチした term ノードの子孫 p |
| `term + *` | term ノードの直後の兄弟 |
| `term ~ *` | term ノードより後ろの兄弟すべて |
| `term > li:contains('名前') > li` | term → 直下の「名前」li → さらに直下の li |
| `term` | term ノード自身（aliases に指定した場合は括弧・ハイフン・コロン記法を抽出） |

**`aliases: "term"` の特殊動作**

`aliases` に `"term"`（コンビネータなし）を指定した場合のみ、取得するテキストではなく
**用語テキスト内の区切り記法を解析してエイリアスを抽出**する。
区切り記法の詳細は「[エイリアス自動抽出](#エイリアス自動抽出)」を参照。

```yaml
# ○ "term" 単体 → 用語テキスト自体を解析して括弧・ハイフン・コロンから抽出
aliases: "term"

# ○ "term > ..." → 別ノードのプレーンテキストをそのままエイリアスとして使用
aliases: "term > li:contains('名前') > li"
```

### セレクタ使用例

```yaml
# h2 "ユビキタス言語" の直接子 h3 すべてを用語として選択
# → "集約（Aggregate）", "リポジトリ" のみ（"エンティティ" は別の h2 配下なので除外）
rules:
  term: "h2:contains('ユビキタス言語') > h3"
  definition: "term > p"
```

```yaml
# ネストリストから aliases と definition を抽出する例
#
# 対象 Markdown:
#   ## 集約
#   * コードの中の名前
#     * Aggregate
#   * 説明
#     * 集約とは…
rules:
  term: "h2"
  aliases: "term > li:contains('コードの中の名前') > li"
  definition: "term > li:contains('説明') > li"
```

```yaml
# ルート直下の h2 すべてを用語として選択
rules:
  term: "h1 > h2"
  definition: "term > p"
```

```yaml
# どの深さにある h3 でも用語として選択（h2 を問わない）
rules:
  term: "h3"
  definition: "term ~ p"
```

---

## JSON アダプタ

配列形式の JSON をソースとして使う場合。`rules.term` / `rules.definition` にはセレクタではなくフィールド名を指定する。

```yaml
adapter: json
rules:
  term: "term"            # 各オブジェクトの用語フィールド名
  definition: "description"  # 各オブジェクトの定義フィールド名
```

JSON の各オブジェクトに `aliases` 配列フィールドがあれば自動的に取り込まれる。重複は除去される。

---

## エイリアス自動抽出

`aliases: "term"` を指定したとき（`"term"` 単体のみ。`"term > ..."` は対象外）、
用語テキストから以下 3 種の記法でエイリアスと区切り文字以前のプレーンな用語名が抽出される。
区切り文字以降は `aliases` に入り、`term` フィールドからは除去される。

### 対応記法

| 記法 | 例 | `term` | `aliases` |
|---|---|---|---|
| 括弧（全角） | `集約（Aggregate）` | `集約` | `["Aggregate"]` |
| 括弧（半角） | `リポジトリ(Repository)` | `リポジトリ` | `["Repository"]` |
| ハイフン区切り | `集約 - Aggregate` | `集約` | `["Aggregate"]` |
| ハイフン区切り（スペースなし） | `集約 -Aggregate` | `集約` | `["Aggregate"]` |
| エムダッシュ区切り | `集約 — Aggregate` | `集約` | `["Aggregate"]` |
| コロン区切り（半角） | `集約:Aggregate` | `集約` | `["Aggregate"]` |
| コロン区切り（全角） | `集約：Aggregate` | `集約` | `["Aggregate"]` |
| 記法なし | `リポジトリ` | `リポジトリ` | `[]` |

ハイフン記法はセパレータの前にスペースが必要（`用語 -alias`）。コロン記法はスペース不要。

複数記法が混在する場合はすべてのエイリアスが収集され、重複は除去される。

また、`:has-alias` と `:alias('text')` セレクタも上記 3 種の記法すべてを検出する。

---

## JSON 中間表現（dict.json）

### スキーマ

```typescript
interface DictFile {
  version: 1;
  updatedAt: string;   // ISO 8601 タイムスタンプ
  entries: DictEntry[];
}

interface DictEntry {
  term: string;          // 用語（括弧表記を除いたプレーンテキスト）
  aliases: string[];     // 英語別名など
  definition: string;    // 定義のプレーンテキスト
  definitionHtml: string; // 定義の HTML
  source: string;        // nymph.yml の sources[].name
  sourceRef: string;     // 予約（現在は常に ""）
}
```

### サンプル出力

以下の Markdown と nymph.yml を使った場合：

**glossary.md**

```markdown
# ドメイン用語集

## ユビキタス言語

### 集約（Aggregate）

集約とは、整合性を保つべきオブジェクトの集まりである。

### リポジトリ

リポジトリとは、集約の永続化と再構築を担うオブジェクトである。
```

**nymph.yml**

```yaml
sources:
  - name: glossary
    fetch:
      cmd: ["cat", "glossary.md"]
    adapter: markdown
    rules:
      term: "h2:contains('ユビキタス言語') > h3"
      aliases: "term"        # 括弧・ハイフン・コロン記法からエイリアスを抽出
      definition: "term > p"
dict:
  out: ".nymph/dict.json"
```

**出力 (.nymph/dict.json)**

```json
{
  "version": 1,
  "updatedAt": "2026-01-15T10:30:00.000Z",
  "entries": [
    {
      "term": "集約",
      "aliases": ["Aggregate"],
      "definition": "集約とは、整合性を保つべきオブジェクトの集まりである。",
      "definitionHtml": "<p>集約とは、整合性を保つべきオブジェクトの集まりである。</p>\n",
      "source": "glossary",
      "sourceRef": ""
    },
    {
      "term": "リポジトリ",
      "aliases": [],
      "definition": "リポジトリとは、集約の永続化と再構築を担うオブジェクトである。",
      "definitionHtml": "<p>リポジトリとは、集約の永続化と再構築を担うオブジェクトである。</p>\n",
      "source": "glossary",
      "sourceRef": ""
    }
  ]
}
```

---

## デバッグ

`--debug` フラグを付けると中間成果物が出力される。

| ファイル | 内容 |
|---|---|
| `.nymph/debug/tree/<name>.json` | Markdown から構築したノード木 |
| `.nymph/debug/match/<name>.json` | セレクタがマッチした term→definition の対応 |
