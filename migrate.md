# nymph ロードマップ

## 現在の構成

| 役割 | 採用技術 |
|---|---|
| サーバー / CLI | Bun (`Bun.serve`) |
| フロントエンド | React 18 + TypeScript |
| ビルド | Vite 7 |
| テスト（単体 / コンポーネント） | Vitest 3 + @testing-library/react |
| テスト（E2E） | Playwright |
| 配布 | npm (`bunx nymph`) / `bun build --compile` |

移行完了（Python + vanilla JS → Bun + React/TypeScript）。

---

## 直近

- [ ] `bun publish` — npm レジストリへ公開（`bunx nymph` で使えるようにする）
- [ ] Vite 8 / Vitest 4 へアップグレード（Bun 1.4 リリース待ち）

---

## 中期

- [ ] `/edit-op` フック用スクリプトの `python3` 依存を除去（`bun` または `jq` に置き換え）
- [ ] テキスト選択コメントの E2E カバレッジ追加
- [ ] `droppedContent`（ドラッグ&ドロップ）系のコメント保存対応

---

## 検討中

- フロントエンド完全 SPA 化（`vite build` 不要にする）のコスト検証
- Claude Code プラグインとしての自動インストール対応強化
