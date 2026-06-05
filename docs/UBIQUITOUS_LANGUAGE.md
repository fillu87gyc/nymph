# dict モジュール — ユビキタス言語

> `src/dict` モジュールで使われる概念・用語を一覧化したドキュメントです。
> コード・設計・会話のすべてでここに書かれた言葉を使います。

---

## 目次

1. [コアドメイン — 辞書エントリ](#1-コアドメイン--辞書エントリ)
2. [設定（thyrs.yml）](#2-設定thyrsyml)
3. [ノード木](#3-ノード木)
4. [セレクタシステム](#4-セレクタシステム)
5. [アダプタ](#5-アダプタ)
6. [キャッシュ・永続化](#6-キャッシュ永続化)
7. [ビルドパイプライン](#7-ビルドパイプライン)

---

## 1. コアドメイン — 辞書エントリ

### 用語（term）

辞書に登録される概念の名前。括弧表記を除いたプレーンテキスト。

```
"集約（Aggregate）" → term: "集約"
```

### エイリアス（aliases）

用語の別名一覧（英語表記など）。括弧表記から自動抽出されるほか、JSON ソースの `aliases` フィールドからも補完される。

| 元テキスト | term | aliases |
|---|---|---|
| `集約（Aggregate）` | `集約` | `["Aggregate"]` |
| `リポジトリ(Repository)` | `リポジトリ` | `["Repository"]` |
| `ドメインサービス（Domain Service）` | `ドメインサービス` | `["Domain Service"]` |
| `リポジトリ` | `リポジトリ` | `[]` |

### 括弧表記（parenthetical notation）

用語テキスト中の `（英語名）` または `(英語名)` 形式の記法。全角・半角どちらでも解釈される。自動的にエイリアスへ分離される。

### 定義（definition）

用語の意味を説明するプレーンテキスト。HTML タグを含まない。

### 定義 HTML（definitionHtml）

`definition` を HTML としてレンダリングした文字列。UI 表示に使用される。

### ソース名（source）

エントリの出所を表す識別子。`thyrs.yml` の `sources[].name` が入る。

### ソース参照（sourceRef）

将来の拡張のために予約されたフィールド。現在は常に空文字列 `""`。

### 辞書エントリ（DictEntry）

1 つの用語とその付属情報をまとめたレコード。

```typescript
interface DictEntry {
  term: string;
  aliases: string[];
  definition: string;
  definitionHtml: string;
  source: string;
  sourceRef: string;
}
```

### 辞書ファイル（DictFile）

全エントリをまとめた JSON 出力の最上位構造。`version` は常に `1`。

```typescript
interface DictFile {
  version: 1;
  updatedAt: string;   // ISO 8601
  entries: DictEntry[];
}
```

---

## 2. 設定（thyrs.yml）

### 設定ファイル（config）

モジュールの動作を制御する YAML ファイル。デフォルトはプロジェクトルートの `.thyrs/config.yml`。

```yaml
sources:
  - name: glossary
    fetch:
      cmd: ["cat", "docs/UBIQUITOUS_LANGUAGE.md"]
    adapter: markdown
    rules:
      term: "h3"
      definition: "term > p"
dict:
  ttl: "24h"
  out: ".thyrs/dict.json"
```

### ソース設定（SourceConfig）

1 つのデータソースを定義するオブジェクト。`name`・`fetch`・`adapter`・`rules` の 4 フィールドを持つ。

### フェッチコマンド（fetch.cmd）

原文を標準出力に吐くコマンドの配列。シェルを介さず直接 `spawn` される（シェルインジェクション防止）。

### glob 展開（glob expansion）

`fetch.cmd` の引数に `*` や `?` が含まれる場合、Bun.Glob でファイルパスに展開する処理。コマンド名（`cmd[0]`）は展開対象外。

### ソースルール（SourceRules）

用語と定義をどのノードから取得するかを指定するオブジェクト。

```typescript
interface SourceRules {
  term: string;       // 用語ノードを選ぶセレクタ（または JSON フィールド名）
  definition: string; // 定義ノードを選ぶ相対セレクタ（または JSON フィールド名）
}
```

### TTL（Time-to-Live）

辞書ファイルのキャッシュ有効期限。`"24h"` や `"30m"` 形式で指定する。省略時は 24 時間。

### 出力パス（out）

`dict.json` の書き込み先。省略時は `.thyrs/dict.json`。

---

## 3. ノード木

### ノード（NestedNode）

Markdown から変換された 1 要素を表すオブジェクト。型・テキスト・HTML・子ノードリストを持つ。

```typescript
interface NestedNode {
  type: 'h1'|'h2'|'h3'|'h4'|'h5'|'h6'|'p'|'li'|'code'|'blockquote'|'table';
  text: string;
  raw: string;
  html: string;
  depth?: number;
  children: NestedNode[];
  parent?: NestedNode;
}
```

### ノード型（node type）

ノードが表す Markdown 要素の種類。

| 型 | 要素 |
|---|---|
| `h1`〜`h6` | 見出し（深さ 1〜6） |
| `p` | 段落 |
| `li` | リスト項目 |
| `code` | コードブロック |
| `blockquote` | 引用ブロック |
| `table` | テーブル |

### 木構造（tree）

Markdown 文字列からノードの親子階層を構築したもの。見出しを軸として木が組み立てられ、非見出しブロックは直近の見出しの子になる。

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

### 見出しスタック（heading stack）

木構築中に「現在開いている見出し」を深さごとに追跡する内部配列。同じ深さまたは深い見出しが現れると閉じられる。

### ルートノード（root node）

親を持たないノード。`NestedNode.parent` が `undefined`。木のトップレベルに位置する。

### 子孫（descendants）

あるノードの子・孫・曾孫… を再帰的に集めたノード集合。深さ制限なし。

### 直接の子（direct children）

あるノードの `children` 配列の要素。深さ 1 のみ。

### 兄弟（siblings）

同じ親を持つノード群。ルートノードの兄弟は木全体のルートリスト。

---

## 4. セレクタシステム

> セレクタは CSS セレクタに似た構文で、木からノードを選び出す。

### 型セレクタ（type selector）

ノードの型で絞り込む最も基本的なセレクタ。`h1`〜`h6`、`p`、`li`、`code`、`blockquote`、`table`、`*`（任意）が使える。

### 疑似クラス（pseudo-class）

`:contains('テキスト')` 形式で、`text` フィールドに指定文字列を**部分一致**で含むノードのみを通すフィルタ。シングルクォート・ダブルクォートどちらも使用可。

```
h2:contains('ユビキタス言語')  → テキストに "ユビキタス言語" を含む h2
```

### コンビネータ（combinator）

2 つのセレクタの位置関係を定義する記号。

| 記法 | 名前 | 意味 |
|---|---|---|
| `A > B` | 子コンビネータ | A の**直接の子**で B にマッチ |
| `A B` | 子孫コンビネータ | A の**子孫**（任意の深さ）で B にマッチ |
| `A + B` | 隣接兄弟コンビネータ | A の**直後の兄弟**で B にマッチ |
| `A ~ B` | 後続兄弟コンビネータ | A より**後ろの兄弟すべて**で B にマッチ |

### 単純セレクタ（SimpleSelector）

型セレクタと `:contains()` の組み合わせで表される最小単位のセレクタ。

```typescript
interface SimpleSelector {
  type: NodeType | '*';
  contains?: string;
}
```

### セレクタパーツ（SelectorPart）

コンビネータと単純セレクタのペア。複合セレクタをトークナイズした結果の単位。

### 相対セレクタ（relative selector）

`rules.definition` 専用の構文。`term` をアンカー（起点）として定義ノードの位置を指定する。

| セレクタ | 意味 |
|---|---|
| `term > p` | term ノードの直接子 p |
| `term p` | term ノードの子孫 p |
| `term + *` | term ノードの直後の兄弟 |
| `term ~ *` | term ノードより後ろの兄弟すべて |
| `term` | term ノード自身 |

---

## 5. アダプタ

### アダプタ（DictAdapter）

raw テキストから `DictEntry[]` を抽出するインターフェース。`name` と `extract` メソッドを持つ。

```typescript
interface DictAdapter {
  name: string;
  extract(raw: string, rules: SourceRules): DictEntry[];
}
```

### アダプタレジストリ（adapter registry）

`name → DictAdapter` の Map。`registerAdapter` で登録し `getAdapter` で取得する。

### Markdown アダプタ（markdown adapter）

Markdown テキストを木に変換し、セレクタで用語・定義を抽出するアダプタ。`buildTree` → `select` → `selectRelative` の順で処理する。エイリアスは括弧表記から自動抽出される。

### JSON アダプタ（json adapter）

配列形式の JSON をソースとするアダプタ。`rules.term` と `rules.definition` にはセレクタではなく**フィールド名**を指定する。

```yaml
adapter: json
rules:
  term: "term"
  definition: "description"
```

---

## 6. キャッシュ・永続化

### 鮮度（freshness）

`dict.json` の新旧状態。`updatedAt` から TTL を超過していれば **stale（陳腐）**、TTL 内であれば **fresh（新鮮）**。stale の場合は再ビルドが必要。

### TTL パース（TTL parse）

`"24h"` `"30m"` 形式の文字列をミリ秒に変換する処理。`0` または不正な形式はデフォルト（86400000ms = 24h）にフォールバックする。

### デバッグ成果物（debug artifacts）

`--debug` フラグ使用時に `.thyrs/debug/` 以下に出力される中間ファイル群。

| ファイル | 内容 |
|---|---|
| `.thyrs/debug/tree/<name>.json` | Markdown から構築したノード木（parent 参照なし） |
| `.thyrs/debug/match/<name>.json` | セレクタがマッチした term → definition の対応 |

### parent 参照の剥離（strip parent）

`NestedNode` は `parent` に循環参照を持つため、JSON シリアライズ前に `parent` フィールドを除去する処理。

### raw キャッシュ（raw cache）

デバッグ時に `.thyrs/raw/<name>.txt` へ書き出すフェッチ後の生テキスト。

---

## 7. ビルドパイプライン

### ビルド関数（buildDict）

辞書ビルドのエントリポイント。設定を読み込み、各ソースからエントリを抽出し、`dict.json` を書き出す。

```
loadConfig
  ↓
（skipIfFresh チェック）
  ↓
for each source:
  spawnSync (fetch.cmd)
    ↓
  getAdapter → extract
    ↓
  entry.source = source.name
  ↓
writeDictFile
```

### ビルドオプション（BuildOptions）

`buildDict` に渡すオプション群。

| フィールド | 意味 | デフォルト |
|---|---|---|
| `configPath` | config.yml のパス | （必須） |
| `outPath` | dict.json の出力先 | `config.dict.out` か `.thyrs/dict.json` |
| `debug` | デバッグ成果物を出力するか | `false` |
| `debugDir` | デバッグ出力先ディレクトリ | `.thyrs/debug` |
| `cwd` | コマンド実行の作業ディレクトリ | `process.cwd()` |
| `skipIfFresh` | fresh な dict.json があれば再ビルドをスキップするか | `false` |

### 新鮮スキップ（skipIfFresh）

`true` かつ `dict.json` が fresh な場合、フェッチ・変換をスキップして既存の `DictFile` をそのまま返す早期リターンの最適化。

### シェルなし実行（shell-free spawn）

`cp.spawnSync` を `shell: false` で呼び出すことで、シェルインジェクションを防ぐ実行方式。引数は配列として直接渡される。

---

## 概念間の関係

```
.thyrs/config.yml (ThyrsYml)
  └── sources[] (SourceConfig)
        ├── fetch.cmd  ──spawn──▶  raw テキスト
        ├── adapter    ──▶  DictAdapter.extract()
        │                      ├── [markdown] buildTree ▶ NestedNode[] ▶ select/selectRelative
        │                      └── [json]     JSON.parse ▶ フィールド名で抽出
        └── rules (SourceRules)
              ├── term       → セレクタ or フィールド名
              └── definition → 相対セレクタ or フィールド名

DictEntry[]  ──writeDictFile──▶  .thyrs/dict.json (DictFile)
                                          ↑
                                     isStale? ──No──▶ skipIfFresh で早期リターン
```
