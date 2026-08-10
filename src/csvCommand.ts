/**
 * `nymph export <file.md> [-o <out.csv>]` の I/O 側。
 *
 * CSV の組み立ては `csvExport.ts`（純粋）に置き、ここは「本文とレビューデータを
 * 読む → 書き出す / 返す」だけを担う。出力先を省いたときは書き出さずに文字列を
 * 返し、CLI が標準出力へ流す（`nymph export a.md > a.csv` のような使い方と、
 * `-o` でファイルに落とす使い方の両方を同じ経路で通すため）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderCommentsCsv } from './csvExport.ts';
import { readComments } from './reviewStore.ts';

export interface CsvExportResult {
  /** CSV 本文（`-o` を指定した場合も返す）。 */
  csv: string;
  /** 書き出した CSV の絶対パス。標準出力へ返した場合は null。 */
  outPath: string | null;
  /** 元にした Markdown の絶対パス。 */
  file: string;
  /** 書き出したコメント件数（見出し行を除く行数）。 */
  count: number;
}

export interface CsvExportOptions {
  /** 出力先。省略すると書き出さず、CSV 文字列だけを返す。 */
  outPath?: string | null;
  /** 先頭に UTF-8 BOM を付けるか（既定: false）。 */
  bom?: boolean;
}

/**
 * 保存済みコメントを CSV にする。
 *
 * 出力先の親ディレクトリが無ければ作る。元ファイルへの上書きは拒否する
 * （`--annotate` と同じく、レビュー対象は書き換えない）。
 */
export function exportCommentsCsv(
  file: string,
  options: CsvExportOptions = {},
): CsvExportResult {
  const absFile = resolve(file);
  const absOut =
    options.outPath == null || options.outPath === ''
      ? null
      : resolve(options.outPath);

  if (absOut === absFile) {
    throw new Error('出力先が元ファイルと同じです');
  }

  const content = readFileSync(absFile, 'utf-8');
  const comments = readComments(absFile);
  const csv = renderCommentsCsv({
    file: absFile,
    content,
    comments,
    bom: options.bom,
  });

  if (absOut !== null) {
    const outDir = dirname(absOut);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(absOut, csv, 'utf-8');
  }

  return { csv, outPath: absOut, file: absFile, count: comments.length };
}
