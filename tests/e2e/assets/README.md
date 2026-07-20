# E2E 用ベンダリング済み静的資産

E2E / VRT を CDN・ネットワーク状態から切り離し、本番と同じ Web フォントが
ロードされた状態を決定的に再現するためのローカルコピー。
`tests/e2e/fixtures.ts` の `routeStaticAssets` が配信する。

## 内容

- `google-fonts.css` — Google Fonts CSS API v2 のレスポンス
  （latin / latin-ext サブセットのみ抜粋）
- `fonts/*.woff2` — 上記 CSS が参照するフォントファイル
  （fonts.gstatic.com 配信の Web フォントビルド、無改変）

## ライセンス

収録フォントはすべて [SIL Open Font License 1.1](https://scripts.sil.org/OFL)
（全文: `OFL.txt`）。OFL はフォント単体での販売を除き、ソフトウェアへの
同梱・再配布を許可している。各ファイルの著作権表記（woff2 の name table に
埋め込まれているものと同一）:

| Family | Copyright |
|---|---|
| DM Sans | Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts) |
| Inter | Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter) |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) |

highlight.js のテーマ CSS はここには含めない（BSD-3-Clause、テスト実行時に
lockfile 固定の `node_modules/highlight.js` から配信する）。

## 再生成手順

アプリが使うフォントを変更・追加したときは以下を実施:

1. `index.html` の Google Fonts URL から CSS を取得
   （Chrome の User-Agent を付けて woff2 版を得ること）
2. latin / latin-ext の `@font-face` ブロックのみ残して
   `google-fonts.css` として保存
3. CSS 中の fonts.gstatic.com URL をすべてダウンロードし、
   ファイル名そのままで `fonts/` に保存
4. `tests/e2e/vrt.ts` の `VRT_FONT_SPECS` を更新
5. VRT ベースラインを削除して CI に再生成させる
