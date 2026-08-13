/**
 * 画面（ブラウザ）からのエクスポートで返す中身を組み立てる。
 *
 * CLI には 3 つの出力がある——`--export`（静的 HTML）・`--annotate`
 * （コメント入り Markdown）・`nymph export`（CSV）。画面からも同じものを
 * 落とせるようにするための窓口が `GET /export` で、ここはその「本文を作る」
 * 部分だけを担う（Response の組み立てとアクセス制御は `server.ts`）。
 *
 * 組み立てそのものは CLI と同じ純関数（`htmlExport` / `markdownAnnotate` /
 * `csvExport`）へ委譲する。**画面から落としたファイルと CLI が書き出した
 * ファイルが違う、を作らない**のがこのモジュールの存在理由なので、ここで
 * 独自の整形は一切しない。
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  EXPORT_CONTENT_TYPE,
  type ExportFormat,
  exportFilename,
} from './client/lib/exportFile.ts';
import { renderCommentsCsv } from './csvExport.ts';
import { renderExportHtml } from './htmlExport.ts';
import { annotateMarkdown } from './markdownAnnotate.ts';
import { containsMermaid } from './reviewBlocks.ts';
import { readComments, readRound } from './reviewStore.ts';

export type { ExportFormat };

export interface BuildExportOptions {
  /**
   * Mermaid 描画エンジン（`dist/mermaid-standalone.js`）を読む関数。
   *
   * 渡すと HTML へ丸ごと焼き込み、落とした 1 枚のファイルだけで図が描かれる。
   * 値ではなく関数で受けるのは 2 つの理由から——このモジュールがビルド成果物
   * （`dist/`）の有無に依存しないこと（`dist/` を持たない環境でもテストできる）、
   * そして **図が 1 つも無い文書では 3MB を読みに行かない**こと。
   */
  loadMermaidBundle?: () => string;
  /**
   * CSV の先頭に UTF-8 BOM を付けるか（既定: true）。
   *
   * CLI（`nymph export`）の既定は BOM 無しだが、あちらは標準出力へ流して
   * パイプに繋ぐ経路を既定に置いている。画面からのダウンロードは行き先が
   * ほぼ表計算ソフトなので、既定を反転させて Excel での文字化けを防ぐ。
   */
  bom?: boolean;
  /** 生成日時（テストから固定するため注入可能）。 */
  generatedAt?: Date;
}

export interface ExportPayload {
  /** 書き出す本文。 */
  body: string;
  /** ダウンロード時のファイル名（`sample-review.html` など）。 */
  filename: string;
  /** `Content-Type` ヘッダの値。 */
  contentType: string;
}

/**
 * 保存済みのレビューデータを読み、指定された形式の本文を返す。
 *
 * 副作用は読み取りのみ（本文・コメント・相対画像）。ファイルは書き出さない
 * ——生成物はブラウザのダウンロードとして渡すため、サーバー側のディスクに
 * 何も残さない。
 */
export function buildExportPayload(
  file: string,
  format: ExportFormat,
  options: BuildExportOptions = {},
): ExportPayload {
  const content = readFileSync(file, 'utf-8');
  const comments = readComments(file);
  const round = readRound(file);
  const { generatedAt, loadMermaidBundle } = options;

  const body =
    format === 'html'
      ? renderExportHtml({
          file,
          content,
          comments,
          round,
          generatedAt,
          // 相対画像はデータ URI に焼き込む。落とした HTML は元の
          // ディレクトリから離れて開かれる前提のため（CLI と同じ既定）。
          embedImages: true,
          mermaidBundle:
            loadMermaidBundle && containsMermaid(content)
              ? loadMermaidBundle()
              : undefined,
        })
      : format === 'md'
        ? annotateMarkdown({ file, content, comments, round, generatedAt })
            .markdown
        : renderCommentsCsv({
            file,
            content,
            comments,
            bom: options.bom ?? true,
          });

  return {
    body,
    filename: exportFilename(basename(file), format),
    contentType: EXPORT_CONTENT_TYPE[format],
  };
}

/**
 * `Content-Disposition: attachment` の値を組み立てる。
 *
 * 日本語のファイル名（`設計書-review.html`）を落とせるよう RFC 5987 の
 * `filename*` を付ける。素の `filename` も残すのは、`filename*` を解さない
 * 古いクライアントでも名前無しにならないようにするため（そちらへは
 * ASCII に落とした名前を渡す）。
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
