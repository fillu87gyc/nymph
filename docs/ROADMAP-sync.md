# nymph 同期ロードマップ — PR ベースのコメント共有

> 本体のロードマップ（[`../ROADMAP.md`](../ROADMAP.md)）とは独立したテーマとして進める。
> 起票: 2026-08-21
> スタック前提: Bun · React 19 · TypeScript · Vite 8
> 脆弱性診断: [`ROADMAP-sync-security.md`](./ROADMAP-sync-security.md)（この設計に対する所見。
> 着手前に S1〜S4 の対策を仕様へ落とす）

---

## 何を作るのか

**複数人のレビューコメントを、GitHub の Pull Request を合流点にして同期する。**

nymph でローカルに書いたコメントが PR のレビューコメントとして相手に届き、相手が
GitHub のブラウザ上で書いたコメントが自分の nymph の画面に出る。これを
「開きっぱなしの画面が勝手に追いつく」状態まで持っていく。

同期を走らせるのは **nymph 本体**。内部から `gh` を spawn する。同期先は
`.nymph/config.yml` に書く任意コマンドで差し替えられる（GitHub 以外へも回せる）。

---

## なぜ今できるのか — 除外の「理由」が消えた

本体ロードマップの除外節にはこうある。

> 共有（crit share 相当）・GitHub PR 同期: **サーバー/認証が絡むため**当面スコープ外

`gh` に外注する構成では、その理由が成立しなくなる。

- nymph は**トークンを一切保持しない**（認証は `gh auth` の管轄）
- `SERVER_HOSTNAME = '127.0.0.1'`（`src/server.ts`）に**触らない**。待ち受けを1つも増やさない
- 同期は**外向きの spawn** であって、待ち受けではない

したがって `--host` フラグ（LAN 公開）を実装しないという判断（2026-07-22）とも衝突しない。
**決定を覆すのではなく、決定の根拠が無くなった**という位置づけで進める。

---

## 体験の目標と非目標

### 目標

| # | 体験 | 実現手段 |
|---|---|---|
| a | 他人のコメントが見える | pull（`gh` → nymph） |
| b | 誰が書いたか分かる | `Comment.author` |
| c | リアルタイムに出る | ポーリング pull + 既存の SSE `/watch` |
| d | スレッドで返信できる | `Comment.replyTo` |

このうち **(c) だけがサーバー/認証を要求していた**。gh 外注でそこが外れたので、
(a)(b)(d) は同期経路を作る前から着手できる。

### 非目標

- **同時編集のカーソル共有・プレゼンス表示**はやらない。レビューコメントは追記が主で、
  同一箇所の同時編集がほぼ起きない。秒オーダーの追従で実用になる
- **リアルタイム性は ~30s であって ~30ms ではない**。Google Docs の体感に「近づける」
  のが目標で、同じ土俵に乗るのは目標ではない
- **nymph 自身がサーバーを立てて認証を持つ**ことはしない。それをやるなら別の製品になる

---

## 設計の骨子

### 1. 既存の壁がどう解けるか

| 壁 | 現状 | 解消 |
|---|---|---|
| 保存キーが絶対パスのハッシュ | `reviewKey()`（`src/reviewStore.ts`） | PR が正規識別子をくれる。`owner/repo#123` + **リポジトリ相対パス**は全員で一致する。ローカルの `reviewKey()` は**個人の保存先として温存**し、その上に共有 ID を重ねる |
| POST が全量置換 | `postComments()`（`src/client/hooks/useComments.ts`） | GitHub が合流点になる。1コメント = 1 review comment で個別 ID を持つため、配列単位の後勝ちが構造的に起きない |
| サーバーが loopback 固定 | `SERVER_HOSTNAME`（`src/server.ts`） | 触らない。上記のとおり |

### 2. 中心の難所 — アンカーが一致しない

**ここだけが判断を要する。他は作業。**

- **nymph**: ワーキングツリーの `lineStart` / `lineEnd`。**全行**にコメントできる
- **GitHub PR review comment**: `(path, commit_id, line, side)`。**diff に現れる行にしか置けない**

変更していない行への指摘は、inline review comment として置き場所がない。

**方針**: inline に載るものは inline へ、載らないものは PR の issue comment 1 個に
「本文に紐づかないコメント」としてまとめる。

これは新しい概念を持ち込まない。**`--export` と `--annotate` が既にまったく同じ扱いをしている**
（対象が消えた指摘と差分への指摘を末尾にまとめる。割り当ては `src/reviewBlocks.ts` の
`anchorComments`）。3経路で共有しているロジックに 4 本目として乗せることで、
「経路によって解釈が変わらない」という既存の約束も守られる。

**outdated への対処**: PR head が進むと GitHub 側は `line: null` を返す。ここは
既存資産で殴れる — `Comment.snapshot`（対象行 ±5 行）と `/edit-op` の行リマップが
あるので、テキスト照合で貼り直す既存の考え方に寄せる。

### 3. 識別子と冪等性 — 本文にマーカーを埋める

コメント本文の末尾に `<!-- nymph:c_a1b2c3 -->` を入れる。

- **push**: 既存コメントを一覧 → マーカーで突き合わせ → 無いものだけ create、
  変わったものだけ update。**何回叩いても増えない**
- **pull**: マーカーが**無い**コメント = 誰かがブラウザで直接書いたもの
  → nymph に新規取り込み（`author` = GitHub login、`origin: 'github'`）

後者が「他人のコメントが見える」の実体。手口としては新規ではなく、`--annotate` が
出力の素性を末尾の HTML コメントに残しているのと同じ。

### 4. 状態の対応

| nymph | GitHub |
|---|---|
| 未解決 | open thread |
| 解決済 | resolved thread（GraphQL `resolveReviewThread`） |
| 削除済 | **対応物なし** → ローカル保持 + 本文に注記 |
| round | 対応物なし → 本文のメタ行に載せる |

削除済に対応物が無いのは**正しい状態**。GitHub の outdated は「diff がずれた」、
nymph の削除済は「対象の文章が消えた」で意味が違う。混ぜない。

### 5. 設定と承認 — 既存機構を一般化する（新設しない）

```yaml
# .nymph/config.yml
sync:
  provider: github
  pr: auto              # ブランチから gh pr view --json number で引く
  # provider: custom のときだけ
  pull: { cmd: [...] }  # 標準出力に JSON を吐く
  push: { cmd: [...] }  # 標準入力から JSON を受ける
```

- `provider: github` は組み込み。内部で `gh api` に展開する
- `provider: custom` は `fetch.cmd` と同じ「**シェルを介さず spawn**」。
  `src/dict/build.ts` の `expandGlobArgs` / `assertSpawnResult` をそのまま使う
- **承認は既存の consent 機構を広げる**。`computeCommandsHash()`（`src/dict/consent.ts`）は
  現在 `config.sources` 決め打ちなので、`sources` + `sync` を含む形に拡張し、
  `nymph dict allow` → `nymph allow` へ一般化する。
  **二つ目の承認機構を作らないことがここでは最も重要**
- 組み込みの `provider: github` も**承認対象にする**。`gh` を spawn する事実は custom と変わらない

### 6. 安全側の既定

- **既定 off、リポジトリごとに opt-in**。ローカルのレビューメモが public PR へ
  飛ぶのは取り返しがつかない
- **push は初回だけ確認を挟む**（何件をどの PR へ）。`--dry-run` を持たせる
- **pull は読むだけなので自動でよい**

### 7. 設計原則との整合

本体ロードマップの「設計原則」はすべて維持する。

| 原則 | この機能での守り方 |
|---|---|
| ツールの状態はレビュー対象の外（XDG）に置き、対象を汚さない | 同期しても保存先は XDG のまま。リポジトリにコメントファイルを置かない。共有は PR 側に持たせる |
| ID は採番せずハッシュ導出 | 既存の `c_` + 乱数 ID をそのまま共有 ID として使い、GitHub 側にはマーカーとして埋める。新しい採番をしない |
| 書き込みは常にアトミック、マイグレーションは冪等に | pull の取り込みは `reviewStore` 経由（temp+rename）。push はマーカー突き合わせで冪等 |
| UI は「デフォルトで見せない、必要時に出す」 | 同期 UI は設定で有効化したときだけ出す |

---

## フェーズ

### Phase 1 — スキーマ拡張（`author` / `replyTo` / `origin`）

`Comment`（`src/client/types.ts`）に 3 フィールドを足す。すべて optional で、
既存コメントは無しのまま有効（`resolved` / `createdAt` / `round` / `snapshot` と同じ扱い）。

| フィールド | 用途 |
|---|---|
| `author?` | 表示名。ローカル作成時は省略（= 自分） |
| `replyTo?` | 親コメントの ID。スレッド表示 |
| `origin?` | `'github'` など取り込み元。ローカル作成は省略 |

**同期を作らなくても単体で価値がある**のがこのフェーズの要点 — 1人で使っていても、
人の指摘と AI の指摘、自分の指摘と取り込んだ指摘が区別できるようになる。
ここで無駄になる作業が出ない。

- 影響: `types.ts` / `CommentsPanel` / `CommentModal` / `htmlExport` / `markdownAnnotate` / `csvExport`
- CSV は列が増えるため、既存の列順（`file, id, status, …`）の**末尾に足す**（後段のスクリプトを壊さない）
- テスト: unit（3出力形式のスナップショット）+ E2E（返信の追加と表示）

### Phase 2 — `nymph sync pull`（読むだけ）

**壊しようがないところまでで一度切る。**

- `gh` から PR のレビューコメント + issue comment を取得し、マーカーの有無で
  「自分が push したもの」と「向こうで書かれたもの」を仕分ける
- 後者を nymph のコメントとして取り込む（`author` / `origin: 'github'` 付き）
- 取り込み後に SSE `/watch` が拾い、**開いている画面が勝手に更新される**

GitHub のコメントが画面に出た時点で、狙っている価値の **6 割は取れている**。
push を作る前にここで止めて、本当にこの体験でよいかを判断する。

- テスト: `provider: custom` に**偽の `gh` スクリプトを差す**のがそのままテストの継ぎ目になる
  （カスタムコマンド機構がテスト用の注入口を兼ねる）。E2E は固定の JSON を吐く
  スクリプトを `cmd` に指定して、画面にコメントが出るところまで見る

### Phase 3 — `nymph sync push`

初めて**外向きの副作用**が出る。ここだけ慎重に進める。

- マーカーによる冪等な create / update
- inline に載らないコメントは issue comment へまとめる（`reviewBlocks.ts` 共有）
- `--dry-run`（何件をどの PR へ出すかだけ表示）
- 初回のみ確認プロンプト
- 解決済 → `resolveReviewThread`

- テスト: dry-run の出力を unit で固定。E2E は偽 `gh` に対する呼び出し列を記録して検証

### Phase 4 — 自動化（ここで体感が変わる）

- push: コメント書き込みのたびデバウンス
- pull: タイマー + ウィンドウフォーカス復帰時
- 既存の SSE `/watch` に相乗りして画面へ反映

### Phase 5 — `provider: custom` の一般化

GitHub で形が固まってから、GitLab / Backlog / 社内レビュー系へ回せるように
入出力の JSON スキーマを確定して文書化する。

---

## 完成の定義

CLAUDE.md のとおり、各フェーズとも **E2E がグリーンになった時点**。

```
bun run test && bun run build && bun run test:e2e
```

同期はネットワーク越しの相手を伴うが、`provider: custom` に偽コマンドを差せる設計に
してあるため、**全フェーズで E2E が書ける**（書けないので省略、という逃げ道を作らない）。

---

## 未決事項

- **PR の特定**: `pr: auto`（ブランチから引く）で足りるか。detached HEAD や複数 PR が
  ぶら下がるブランチでどうするか
- **ファイルの対応づけ**: nymph はリポジトリ外の `.md` も開ける。PR に存在しない
  ファイルへのコメントを同期対象からどう外すか（無言で落とさない形にする）
- **取り込んだコメントの編集可否**: `origin: 'github'` のコメントをローカルで編集
  できるようにするか、読み取り専用にするか
- **競合**: 同じコメントを両側で更新した場合の扱い（現状の想定は「GitHub 側を正」）
- **削除の伝播**: ローカルで消したコメントを GitHub 側でも消すか、残すか

---

## 作業に伴う更新対象

- `docs/UBIQUITOUS_LANGUAGE.md` — 「同期」「マーカー」「取り込み」などの用語追加
  （辞書のソースなので、概念を足したら更新する）
- `docs/features.md` — 実装済み機能の一覧
- `README.md` — 設定と CLI の節
- `../ROADMAP.md` の除外節 — 「GitHub PR 同期」がスコープ外でなくなった旨と、
  この文書への参照
