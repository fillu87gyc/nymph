# nymph

AI が生成した Markdown・Mermaid をレビューするための軽量ツール。

```bash
nymph output.md
```

ブラウザが開き、ファイルを監視して自動再レンダリングします。

**スタック**: Bun · React 18 · TypeScript · Vite 7

---

## 要件

- **Bun** (`mise use -g bun` または [bun.sh](https://bun.sh))

---

## インストール

**bunx（インストール不要）**
```bash
bunx @fillu87gyc/nymph *.md
```

**グローバルインストール**
```bash
bun install -g @fillu87gyc/nymph
nymph *.md
```

**単一バイナリ（Bun 不要で配布可）**
```bash
bun build --compile src/cli.ts --outfile nymph
./nymph *.md
```

**ローカル開発**
```bash
git clone https://github.com/fillu87gyc/nymph
cd nymph
bun install
bun run src/cli.ts output.md
```

クローンを指す `nymph` コマンドを常設するなら `bun link` を使います。以後は `git pull && bun run build` だけで最新（origin/main）に追従します。

```bash
bun run build   # dist は .gitignore 済みなので必須
bun link        # ~/.bun/bin/nymph → クローンの src/cli.ts
```

`bun install -g github:fillu87gyc/nymph` は使わないでください。`dist/` は git に入っていないため、**サーバーは起動するのに画面が真っ白**という状態になります。

---

## 使い方

```bash
nymph output.md
# nymph   http://localhost:6276
# 監視中  /path/to/output.md
# Ctrl+C で停止
```

複数ファイルや glob も指定できます：

```bash
nymph *.md
```

ディレクトリを渡すと、VSCode のようにサイドバーへ階層ツリーを表示して `.md` を開けます：

```bash
nymph ./docs
nymph ./           # カレントディレクトリをツリー表示
```

### オプション

```
使い方: nymph [オプション] [ファイル|ディレクトリ ...]

引数:
  ファイル ...          監視する .md ファイル（glob 対応）
  ディレクトリ          サイドバーにツリー表示して .md を開けるようにする

オプション:
  -p, --port <番号>    使用するポート番号 (デフォルト: 6276)
  --no-open            ブラウザを自動的に開かない
  --export <出力先>    コメント埋め込みの静的 HTML を書き出して終了する
                       （サーバーは起動しない。ファイルを1つだけ指定する）
  --export-mermaid     エクスポートに Mermaid 描画エンジンを同梱する
                       （オフラインでも図が描画される。出力が約3MB増える）
  --annotate <出力先>  コメントを本文へ書き戻した Markdown を出力して終了する
                       （各ブロックの直後に「> [nymph] …」の引用を挿し込む。
                         元ファイルは書き換えない）
  --annotate-open      書き戻すコメントを未解決・削除済のみに絞る
  -v, --version        バージョンを表示して終了
  -h, --help           このヘルプを表示して終了

サブコマンド:
  nymph export <ファイル> [-o <出力先>] [--bom]
                       保存済みコメントを CSV にする（-o 省略で標準出力）
  nymph dict build     ユビキタス言語辞書をビルドする
  nymph dict allow     辞書設定に書かれたコマンドを承認する
```

```bash
nymph -p 8080 output.md        # ポートを指定
nymph --no-open output.md      # ブラウザを開かずに起動
nymph --version                # バージョン確認
nymph report.md --export review.html   # レビュー結果を静的 HTML に書き出す
nymph report.md --export review.html --export-mermaid   # 図も描画できる形で
nymph report.md --annotate review.md   # コメントを本文へ書き戻す
nymph export report.md -o review.csv   # コメントを CSV にする
```

指定したファイル / ディレクトリが存在しない場合は、サーバーを起動せずにそのパスを示して終了します（複数指定のうち一部だけ存在しない場合も、黙って無視せずエラーになります）：

```bash
$ nymph README.md typo.md
エラー: 指定されたパスが存在しません: typo.md
  nymph --help でヘルプを表示
```

---

## 機能

### ホットリロード

ファイルの変更を SSE で検知し、即座に再レンダリングします。

### ディレクトリツリー（エクスプローラー）

`nymph ./docs` のようにディレクトリを渡すと、サイドバーに階層ツリーが表示されます（`.md` のみ、隠しディレクトリと `node_modules` は除外）。クリックしたファイルはタブに追加されます。ツールバーの **フォルダを開く** からパスを入力して、起動後にツリーのルートを切り替えることもできます。

![ディレクトリツリー](docs/screenshots/directory-tree.png)

### ウィジェット配置

画面左右の枠に置くパネルは、⚙ 設定の **配置を編集** から開く専用の配置画面で決めます。「利用可能」の一覧と左右の枠のあいだをドラッグ＆ドロップで移すだけで、1 つの枠に複数を縦に積めます（「左＝タブ + アウトライン、右＝コメント」のような並びも作れます）。枠の中の上下の順番もドラッグで入れ替えられます。

| ウィジェット | 内容 | 置ける場所 |
|---|---|---|
| タブ | 開いているファイルの一覧 | 左 / 右 / 横行（既定） |
| エクスプローラー | ルート配下のファイルツリー | 左（既定） / 右 |
| アウトライン | 見出しの一覧 | 左 / 右（既定） |
| コメント | レビューコメントの一覧 | 左 / 右 / 下ドック（既定） |
| 検索結果 | 常設の全文検索。結果から該当行へジャンプ | 左 / 右 |
| 最近 / ブックマーク | 履歴とブックマークの常設リスト | 左 / 右 |
| ミニマップ | 文書全体の俯瞰。コメント位置を点で重ね、クリックでジャンプ | 左 / 右 |
| 図の一覧 | 本文中の Mermaid 図へジャンプ | 左 / 右 |
| タスク | `- [ ]` チェックボックスの一覧（未完のみ絞り込み可） | 左 / 右 |
| リンク / 画像 | リンクと画像の一覧。相対パスは実在するかを判定 | 左 / 右 |
| 用語集 | 辞書の用語一覧と、本文中の出現箇所へのジャンプ | 左 / 右 |
| frontmatter | 先頭の YAML メタ情報 | 左 / 右 |
| 差分サマリ | チェックポイントからの変更箇所の一覧 | 左 / 右 |
| 文書統計 | 文字数・見出し数・推定読了時間など | 左 / 右 |

タブ・エクスプローラー・アウトライン・コメント以外は既定の置き場所を持たないため、枠に置いたときだけ画面に出ます（「利用可能」へ戻すと画面から消えます）。エクスプローラーとアウトラインは必ず左右どちらかの枠に入ります。

マウスを使わない場合は、チップにフォーカスして **← →** で枠を移動、**↑ ↓** で枠の中の並び替えができます。**初期配置にリセット** で初期状態（左＝エクスプローラー / 右＝アウトライン）に戻せます。配置に「保存」ボタンはありません — ドラッグした時点で画面に反映され、そのまま保存されます（**✓ 完了** は画面を閉じるだけです）。

タブを左右の枠に置くと、VSCode の Open Editors のような縦リストになります（横行は 2 ファイル以上でのみ出ますが、縦置きは 1 ファイルでも表示します）。配置はブラウザに保存され、次回起動時も維持されます。

枠の幅は、枠と本文の境目をドラッグして左右それぞれ 140〜480px の範囲で変えられます（フォーカスして **← →** でも 16px ずつ動かせます）。**ダブルクリック**（または **Home** キー）で既定の幅に戻ります。本文の左右端をドラッグする「本文幅の調整」とは別で、こちらはサイドバーの幅だけが変わります。幅もブラウザに保存されます。

### 最近開いたファイル

開いたファイルの履歴を `~/.local/share/nymph/recent.json` に保存します（最大 20 件）。ツールバーの **最近** メニューと、引数なし起動時の画面から再オープンできます。

![最近開いたファイルメニュー](docs/screenshots/recent-menu.png)

引数なしで起動すると、履歴とブックマークが起動画面に表示されます。

![起動画面](docs/screenshots/welcome.png)

### ブックマーク

ツールバーの **★** で、表示中のファイル（未選択時はツリーのルートディレクトリ）を登録できます。**最近** メニューと起動画面に表示され、ファイルは開く・ディレクトリはツリーのルート切替になります。

### Quick Open（Ctrl+P）

`Ctrl+P` / `Cmd+P` で検索パレットを開き、タブ・履歴・ブックマーク・ツリー内の全ファイルを横断して絞り込み、`Enter` で開けます。

![Quick Open](docs/screenshots/quick-open.png)

### Mermaid レンダリング + draw.io エクスポート

Mermaid コードブロックをインラインでレンダリングします。各ダイアグラムに **→ draw.io** ボタンがあり、`.drawio` ファイルのダウンロードまたはコードのコピーができます。

### 画像の表示

`![図](./img/a.png)` のような相対パスの画像は、**md ファイルの場所を起点**に解決して表示します（本文に直接書いた `<img src="...">` も同じです）。ブラウザに任せると相対パスは画面の URL 基準で解決されてしまうため、nymph が起点を補って配信します。

読みに行く範囲はリンクの生死チェックと同じで、`nymph ./docs` のようにルートを渡していればルート配下、ファイル単体で開いていれば**そのファイルのディレクトリ配下**です。範囲の外を指す画像は配信しません（`../` でディレクトリの外へ出る画像を表示したい場合は、それを含むディレクトリをルートとして渡してください）。`https://` などの外部 URL と `data:` の画像は、書かれたままブラウザが読み込みます。

### インラインコメント

レンダリングされた各ブロックにホバーすると **＋** ボタンが表示されます。テキスト選択でも範囲コメントが追加できます。コメントはレビュー対象ファイルを汚さないよう `~/.local/share/nymph/reviews/<key>/comments.json`（`<key>` はファイルの絶対パスから決定論的に導出）に自動保存されます。

### コメントのステータスとスナップショット

各コメントは **未解決 / 削除済 / 解決済** のいずれかの状態を持ちます。未解決のまま
対象の文章がファイルから消えたコメントは自動的に **削除済** になり、解決済みのコメントは
対象が消えても **解決済** のままです。コメントパネルのフィルタで状態ごとに絞り込めます。

コメントには作成時点の「もとの文章」（対象行 + 前後 5 行）が一緒に保存されます。削除済 /
解決済 のバッジをクリックすると、その文章を吹き出しで確認できます。

### レビューのコピー

**レビューをコピー** ボタンで全コメントを JSON 形式でクリップボードにコピーします。

### チェックポイント / Diff

**📍** ボタンでチェックポイントを設定し、**± diff** ボタンで変更箇所をハイライト表示できます。チェックポイントはコメントと同じ `~/.local/share/nymph/reviews/<key>/checkpoint` に保存されます。

### HTML エクスポート

`--export` で、本文と保存済みコメントを 1 枚の静的 HTML に書き出せます。サーバーは起動せず、書き出したら終了します。

```bash
nymph report.md --export review.html
```

生成物は**単体で完結**します。CSS も JavaScript も画像（ファイルと同じディレクトリ配下の相対パス）もすべてファイルの中に焼き込むので、ネットワークが無い環境でもそのまま開けます。メール添付や社内 Wiki への貼り付け、そのままの印刷 / PDF 化を想定しています。

- コメントは対象ブロックの直後に、状態（未解決 / 削除済 / 解決済）・行番号・ラウンド・「もとの文章」つきで並びます
- 対象が消えたコメントと差分への指摘は、末尾の「本文に紐づかないコメント」にまとめます
- ヘッダーの **解決済みを隠す** で解決済みを畳め、**ライト / ダーク** でテーマを切り替えられます（初期値は OS の設定に従います）

#### Mermaid 図

既定ではソースを枠付きで見せるだけですが、`--export-mermaid` を付けると描画エンジンごと焼き込み、**オフラインのまま図が描画されます**。図が 1 つも無い文書では有効にしても同梱しません。

```bash
nymph report.md --export review.html --export-mermaid
```

描画に失敗した図（構文エラーなど）はソース表示のまま残るので、1 つの図の不具合が他を巻き添えにしたり、枠だけが残ったりはしません。テーマを切り替えると図も描き直されます。

CDN から取得する案は採っていません。配布物が開かれるたび第三者へ接続する（＝誰がいつ読んだかが漏れる）うえ、mermaid の ESM ビルドは図の種類ごとにチャンクを動的 import するため SRI で守りきれないためです。

#### アプリ本体と異なる点（意図的なもの）

- 本文中の生 HTML は実行せず、書かれたままエスケープして表示します（配布物に消毒し損ねた HTML を埋めないため）
- コードのシンタックスハイライトは付きません

### 印刷 / PDF

「⋯」メニューの **🖨 印刷 / PDF**（またはブラウザの Ctrl / Cmd + P）で、開いている文書をそのまま印刷・PDF 保存できます。

- 紙に載るのは**本文だけ**です。ツールバー・ウィジェット枠・コメントパネル・各ブロックの操作ボタンは出ません
- テーマがダークでも**配色はライトに倒します**。ブラウザは既定で背景色を印刷しないため、そのまま出すと薄い文字だけが紙に残ってしまうためです（画面のテーマ設定は変わりません）
- コードブロック・表・図はページの切れ目をまたがないようにし、長いコード行は折り返します（紙では横スクロールできないため）
- 見出しはその直後の本文と切り離されないようにします

コメントは紙に出ません。コメント入りで配りたいときは、印刷用 CSS 込みで書き出される `--export` の HTML を開いて印刷してください。

### Markdown への書き戻し

`--annotate` で、保存済みコメントを本文に挿し込んだ Markdown を書き出せます。HTML エクスポートが「読ませる配布物」なのに対し、こちらは**そのまま編集を続けられる形**でレビューを返すためのものです（書き手が人でも AI でも、本文の隣に指摘がある Markdown を受け取ってそのまま直せます）。

```bash
nymph report.md --annotate review.md
nymph report.md --annotate review.md --annotate-open   # 未解決・削除済だけ
```

コメントは対象ブロックの直後に引用として入ります：

```markdown
これは本文の段落です。

> [nymph] 未解決 · L3 · ラウンド 2 · 2026-08-09 10:20
>
> 主語が曖昧です
```

- **本文の行は書き換えません**。足すのは引用と、それを区切るための空行だけです（引用の前後に空行が無いと、直後の本文が引用の続きとして読まれて元の文書の意味が変わるため）
- 行番号（`L3`）は**元ファイル基準**です。引用を挿し込んだ時点で以降の行はずれるので、書き戻した Markdown 自身の行番号とは一致しません
- 対象が消えた指摘と差分への指摘は、末尾の「本文に紐づかないコメント」にまとめます
- 出力の素性（日時・件数・ラウンド）は末尾の HTML コメントに残します。表示には出ないので、そのまま清書に回しても邪魔になりません
- **元ファイルへの上書きは拒否します**。レビュー対象を書き換えないのがこのツールの前提なので、書き戻しは別ファイルへの出力に限っています

### CSV エクスポート

`nymph export` で、保存済みコメントを 1 件 1 行の CSV にできます。表計算・課題管理・スクリプトへ流すための出力です。

```bash
nymph export report.md                 # 標準出力へ（そのままパイプできる）
nymph export report.md -o review.csv   # ファイルへ
nymph export report.md --bom -o review.csv   # Excel で開くなら BOM 付きで
```

列は `file, id, status, line_start, line_end, block_type, round, created_at, target, comment` です。`status` は画面・HTML エクスポートと同じ規則（`open` / `deleted` / `resolved`）で決まります。RFC 4180（CRLF・`"` のエスケープ）に従うので、Excel / Numbers / LibreOffice や `csv` モジュールがそのまま読めます。

`=` `+` `@` で始まる値は先頭に `'` を足して無害化します（表計算ソフトが数式として評価してしまうため）。箇条書きの `- ` は数式にならないのでそのままです。

---

## ユビキタス言語辞書

プロジェクトルートの `.nymph/config.yml` を使って、`docs/UBIQUITOUS_LANGUAGE.md` から辞書ファイルを生成できます。

```bash
nymph dict build
```

`.nymph/dict.json` に辞書ファイルが出力されます（`.gitignore` 対象のため生成ファイルは追跡しません）。

```bash
# デバッグ出力（ノード木とマッチ結果を .nymph/debug/ に保存）
nymph dict build --debug
```

用語集のソースは `docs/UBIQUITOUS_LANGUAGE.md` です。新しいモジュールや概念を追加したときはこちらも更新してください。

---

## 開発

```bash
bun install
bun run dev        # API サーバー(:6276) + Vite(:5173) を同時起動
bun run test       # 単体 + コンポーネントテスト (Vitest 3)
bun run test:e2e   # E2E テスト (Playwright)
bun run build      # プロダクションビルド (Vite 7)
bun run smoke:pack # 公開物（npm pack）をインストールして CLI 入口を叩く
```

`smoke:pack` は `package.json` の `files` から実ファイルが漏れたまま publish される事故を止めるためのものです（`bin` が TypeScript ソースを直接指す構成なので、相対 import はすべて同梱されている必要があります）。作業ツリーで `bun run src/cli.ts` を叩いても漏れは再現しないため、`npm pack` の成果物を隔離ディレクトリへインストールして検証します。リリース時は CI（`.github/workflows/publish.yml` の verify job）が自動で実行します。

dev ではフロントのアセットを配っているのは Vite dev server（:5173）で、API サーバー（:6276）を開いてもビルド済みの古い `dist/` が返るだけです。そのため CLI は「開くべき URL」としてフロント側を表示し、API のポートは補助的に添えます。

```
nymph   http://localhost:5173
API     http://localhost:6276
```

この案内先は `NYMPH_FRONTEND_URL` で決まります（未指定なら API サーバー自身が `dist/` を配る前提でそのポート）。dev では起動済みインスタンスが `/version` でこの値を公開するので、**別の端末から `nymph <file>` を実行して既存インスタンスに委譲したときも、API のポートではなくフロントの URL が表示・オープンされます。**

`NYMPH_FRONTEND_URL` を指定すると Vite はそのポートを `strictPort` で確保します（案内した URL と実際の待受がズレないようにするため。埋まっていれば黙って別ポートに逃げずに失敗します）。

**ghq を使っている場合の開発用ショートカット（`~/.zshrc`）**

```zsh
nymphx() {
  local nymph_dir origdir="$PWD"
  if [[ -f package.json ]] && grep -q '"name": "@fillu87gyc/nymph"' package.json; then
    nymph_dir="$PWD"
  else
    nymph_dir="$(ghq list --full-path nymph | grep '/nymph$' | head -1)"
  fi
  local -a a
  for f in "$@"; do
    case "$f" in
      /*) a+=("$f") ;;
      *)  a+=("$origdir/$f") ;;
    esac
  done
  local port=6276
  while (: < /dev/tcp/127.0.0.1/$port) 2>/dev/null; do ((port++)); done
  # API のポートをずらしたぶん Vite 側もずらす（strictPort で固定されるため）
  local front=$((5173 + port - 6276))
  (cd "$nymph_dir" && NYMPH_PORT="$port" NYMPH_FRONTEND_URL="http://localhost:$front" \
    NYMPH_FILES="${a[*]}" bun run dev)
}
```

```bash
nymphx *.md   # HMR 有効な開発モードで起動
```

### リリース

リリースは GitHub Actions の **Release** ワークフローで完結します。

1. Actions タブ → Release → **Run workflow**
2. `version` にリリースするバージョンを入れる（例: `1.2.3`、プレリリースなら `1.3.0-rc.1`）
3. 実行すると以下が自動で行われる
   - `tsc` / lint / unit test / build による検証
   - `package.json` と `src/cli.ts` の `VERSION` をそのバージョンに揃える
   - タグ `v1.2.3` を作成して push
   - npm へ publish（provenance 付き。プレリリースは dist-tag `next`）
   - リリースノート付きの GitHub Release を作成

`dry_run` を有効にすると、タグ・publish・Release 作成を行わず検証と `npm publish --dry-run` だけを実行します。初回や不安なときの確認用です。

ローカルで `git tag v1.2.3 && git push origin v1.2.3` した場合も同じワークフローが走ります（この経路ではタグ作成のステップだけスキップされます）。

publish が失敗して同じバージョンをやり直す場合、タグが同じコミットに残っていればそのまま再実行できます（タグ作成と publish 済みバージョンはスキップされる）。別のコミットに同名タグがある場合はエラーで止まるので、`git push --delete origin v1.2.3` してから実行し直してください。

> **npm の認証**: npmjs の Trusted Publishing（OIDC）を使っており、`NPM_TOKEN` などの secret は不要です。ただし npmjs 側は **リポジトリとワークフローのファイルパスの組み合わせ** で照合するため、`.github/workflows/publish.yml` をリネームすると `npm error code ENEEDAUTH` で publish に失敗します。ファイル名を変えるときは npmjs の Trusted Publisher 設定も同時に更新してください。

---

## Claude Code との連携

Claude Code のプロジェクトに nymph を追加すると、Edit ツールによるファイル編集時にコメントの行番号が自動追従します。

```bash
claude plugin install github:fillu87gyc/nymph
```

Claude Code 上でフックをインストール：

```
/nymph:install
```

仕組み：`PostToolUse` フックが Edit ツールの `old_string` / `new_string` を `/edit-op` エンドポイントに転送し、編集前後の行数差分でコメント位置を自動補正します。

---

## ライセンス

MIT — 詳細は [`LICENSE`](./LICENSE)。

`dist/` に bundle 化して同梱しているサードパーティ・ソフトウェア（highlight.js /
diff / DOMPurify / marked / Mermaid / KaTeX / React / SWR ほか）の帰属表示・
ライセンス全文は [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) を参照して
ください。
