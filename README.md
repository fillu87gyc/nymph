# thyrs

AI が生成した Markdown・Mermaid をレビューするための軽量ツール。

```bash
thyrs output.md
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
bunx thyrs *.md
```

**グローバルインストール**
```bash
bun install -g thyrs
thyrs *.md
```

**単一バイナリ（Bun 不要で配布可）**
```bash
bun build --compile src/cli.ts --outfile thyrs
./thyrs *.md
```

**ローカル開発**
```bash
git clone https://github.com/fillu87gyc/thyrs
cd thyrs
bun install
bun run src/cli.ts output.md
```

---

## 使い方

```bash
thyrs output.md
# thyrs   http://localhost:6276
# 監視中  /path/to/output.md
# Ctrl+C で停止
```

複数ファイルや glob も指定できます：

```bash
thyrs *.md
```

### オプション

```
使い方: thyrs [オプション] [ファイル ...]

オプション:
  -p, --port <番号>    使用するポート番号 (デフォルト: 6276)
  --no-open            ブラウザを自動的に開かない
  -v, --version        バージョンを表示して終了
  -h, --help           このヘルプを表示して終了
```

```bash
thyrs -p 8080 output.md        # ポートを指定
thyrs --no-open output.md      # ブラウザを開かずに起動
thyrs --version                # バージョン確認
```

---

## 機能

### ホットリロード

ファイルの変更を SSE で検知し、即座に再レンダリングします。

### Mermaid レンダリング + draw.io エクスポート

Mermaid コードブロックをインラインでレンダリングします。各ダイアグラムに **→ draw.io** ボタンがあり、`.drawio` ファイルのダウンロードまたはコードのコピーができます。

### インラインコメント

レンダリングされた各ブロックにホバーすると **＋** ボタンが表示されます。テキスト選択でも範囲コメントが追加できます。コメントは `output.md.comments.json` として自動保存されます。

### レビューのコピー

**レビューをコピー** ボタンで全コメントを JSON 形式でクリップボードにコピーします。

### チェックポイント / Diff

**📍** ボタンでチェックポイントを設定し、**± diff** ボタンで変更箇所をハイライト表示できます。

---

## ユビキタス言語辞書

プロジェクトルートの `.thyrs/config.yml` を使って、`docs/UBIQUITOUS_LANGUAGE.md` から辞書ファイルを生成できます。

```bash
thyrs dict build
```

`.thyrs/dict.json` に辞書ファイルが出力されます（`.gitignore` 対象のため生成ファイルは追跡しません）。

```bash
# デバッグ出力（ノード木とマッチ結果を .thyrs/debug/ に保存）
thyrs dict build --debug
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
```

**ghq を使っている場合の開発用ショートカット（`~/.zshrc`）**

```zsh
thyrsx() {
  local thyrs_dir origdir="$PWD"
  if [[ -f package.json ]] && grep -q '"name": "thyrs"' package.json; then
    thyrs_dir="$PWD"
  else
    thyrs_dir="$(ghq list --full-path thyrs | grep '/thyrs$' | head -1)"
  fi
  local -a a
  for f in "$@"; do
    case "$f" in
      /*) a+=("$f") ;;
      *)  a+=("$origdir/$f") ;;
    esac
  done
  (cd "$thyrs_dir" && THYRS_FILES="${a[*]}" bun run dev)
}
```

```bash
thyrsx *.md   # HMR 有効な開発モードで起動
```

---

## Claude Code との連携

Claude Code のプロジェクトに thyrs を追加すると、Edit ツールによるファイル編集時にコメントの行番号が自動追従します。

```bash
claude plugin install github:fillu87gyc/thyrs
```

Claude Code 上でフックをインストール：

```
/thyrs:install
```

仕組み：`PostToolUse` フックが Edit ツールの `old_string` / `new_string` を `/edit-op` エンドポイントに転送し、編集前後の行数差分でコメント位置を自動補正します。

---

## ライセンス

MIT
