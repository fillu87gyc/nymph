# mdreview

> リポジトリ名: **nymph** (`fillu87gyc/nymph`)

AI が生成した Markdown・Mermaid をレビューするための軽量ツール。

```bash
mdreview output.md
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

インストール不要で使う場合：
```bash
python3 mdreview.py output.md
```

---

## 使い方

```bash
mdreview output.md
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

ツールバーの **レビューをコピー** ボタンで、全コメントを以下の形式でクリップボードにコピーします：

```markdown
# MD Review — 2026/05/28

コメント数: 2

---

## [1] L5–7

\```
## アーキテクチャ
\```

**コメント:** この図は現状と異なります

---

## [2] L12

\```
graph TD
\```

**コメント:** ノード名を日本語に統一してください
```

---

## 要件

- Python 3.8 以上
- 依存パッケージなし（標準ライブラリのみ）
- ブラウザ：Chrome / Edge / Safari（mermaid.js の CDN を使用）

---

## ライセンス

MIT
