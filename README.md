# nymph

> リポジトリ名: **nymph** (`fillu87gyc/nymph`)

AI が生成した Markdown・Mermaid をレビューするための軽量ツール。

```bash
nymph output.md
```

ブラウザが開き、ファイルを監視して自動再レンダリングします。

---

## インストール

**uv（推奨）**
```bash
uv tool install git+https://github.com/fillu87gyc/nymph
```

**pip**
```bash
pip install git+https://github.com/fillu87gyc/nymph
```

**ローカル**
```bash
git clone https://github.com/fillu87gyc/nymph
cd nymph
pip install .
```

インストール不要で使う場合（初回のみ clone、以降は `python3` コマンドのみ）：
```bash
git clone https://github.com/fillu87gyc/nymph  # 初回のみ
cd nymph
python3 nymph.py output.md
```

---

## 使い方

```bash
nymph output.md
# MD Review  http://localhost:6276
# 監視中     /path/to/output.md
# Ctrl+C で停止
```

ファイルを保存するたびにブラウザが自動更新されます。

---

## 機能

### ホットリロード

500ms ポーリングでファイルの変更を検知し、即座に再レンダリングします。Python 標準ライブラリのみ使用。

### Mermaid レンダリング + draw.io エクスポート

Mermaid コードブロックをインラインでレンダリングします。各ダイアグラムに **→ draw.io** ボタンがあり、`.drawio` ファイルのダウンロードまたはコードのコピーができます。

draw.io でのインポート方法：
- ダウンロードした `.drawio` ファイルを draw.io デスクトップで開く
- または draw.io の **挿入 › Mermaid** にコードをペースト

### インラインコメント

レンダリングされた各ブロックにカーソルを合わせると **＋** ボタンが表示されます。クリックするとコメントを追加でき、**元の Markdown の行番号** に紐づいて保存されます。

コメントは `output.md.comments.json` としてファイルの隣に自動保存されます。

### レビューのコピー

ツールバーの **レビューをコピー** ボタンで、全コメントを以下の **JSON 形式**でクリップボードにコピーします：

```json
{
  "date": "2026/5/28",
  "file": "output.md",
  "comment_count": 2,
  "comments": [
    {
      "id": 1,
      "line_start": 5,
      "line_end": 7,
      "block_type": "code",
      "context": { "lang": "", "code": "## アーキテクチャ" },
      "comment": "この図は現状と異なります"
    },
    {
      "id": 2,
      "line_start": 12,
      "line_end": 12,
      "block_type": "code",
      "context": { "lang": "", "code": "graph TD" },
      "comment": "ノード名を日本語に統一してください"
    }
  ]
}
```

---

## Claude Code との連携

Claude Code が Markdown を編集するたびに、コメントのアンカー（行番号）が自動で追従します。

### インストール

```bash
claude plugin install github:fillu87gyc/nymph
```

Claude Code 上で：

```
/nymph:install
```

### 仕組み

nymph 起動時にロックファイル (`{file}.nymph-lock`) を作成します。Claude Code の PostToolUse フックがこのファイルを検知し、Edit ツールの `old_string` / `new_string` を `/edit-op` エンドポイントに送信します。サーバーは変更前のキャッシュから編集位置を特定し、影響を受けるコメントの行番号を即時更新します。

nymph が起動していないときはフックが即座にスキップするため、通常の Claude Code の動作に影響しません。

---

## 要件

- Python 3.8 以上
- 依存パッケージなし（標準ライブラリのみ）
- ブラウザ：Chrome / Edge / Safari（mermaid.js の CDN を使用）

---

## ライセンス

MIT
