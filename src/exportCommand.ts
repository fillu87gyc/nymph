/**
 * `nymph <file> --export <out.html>` の I/O 側。
 *
 * HTML の組み立てそのものは `htmlExport.ts`（ほぼ純粋）に置き、ここは
 * 「本文とレビューデータを読む → 書き出す」だけを担う。CLI から切り出して
 * あるのは、出力先の検証まで含めてテストできるようにするため。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderExportHtml } from './htmlExport.ts';
import { readComments, readRound } from './reviewStore.ts';

export interface ExportResult {
  /** 書き出した HTML の絶対パス */
  outPath: string;
  /** 元にした Markdown の絶対パス */
  file: string;
  /** 焼き込んだコメント件数 */
  commentCount: number;
}

export interface ExportToFileOptions {
  /** 生成日時（テストから固定するため注入可能） */
  generatedAt?: Date;
  /** 相対画像をデータ URI に埋め込むか（既定: true） */
  embedImages?: boolean;
}

/**
 * Markdown と保存済みコメントから静的 HTML を書き出す。
 *
 * 出力先の親ディレクトリが無ければ作る（`--export out/review.html` を
 * 通すため）。失敗はすべて Error を投げ、呼び出し側（CLI）が exit 1 にする。
 */
export function exportToFile(
  file: string,
  outPath: string,
  options: ExportToFileOptions = {},
): ExportResult {
  const absFile = resolve(file);
  const absOut = resolve(outPath);

  if (absOut === absFile) {
    throw new Error('エクスポート先が元ファイルと同じです');
  }

  const content = readFileSync(absFile, 'utf-8');
  const comments = readComments(absFile);
  const round = readRound(absFile);

  const html = renderExportHtml({
    file: absFile,
    content,
    comments,
    round,
    generatedAt: options.generatedAt,
    embedImages: options.embedImages,
  });

  const outDir = dirname(absOut);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(absOut, html, 'utf-8');

  return { outPath: absOut, file: absFile, commentCount: comments.length };
}
