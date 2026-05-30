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
bunx nymph *.md
```

**グローバルインストール**
```bash
bun install -g nymph
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

---

## 使い方

```bash
nymph output.md
# nymph   http://localhost:6276
# 監視中  /path/to/output.md
# Ctrl+C で停止
```

複数ファイルも指定できます：

```bash
nymph *.md
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

## 開発

```bash
bun install
bun run dev        # API サーバー(:6276) + Vite(:5173) を同時起動
bun run test       # 単体 + コンポーネントテスト (Vitest 3)
bun run test:e2e   # E2E テスト (Playwright)
bun run build      # プロダクションビルド (Vite 7)
```

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

MIT
