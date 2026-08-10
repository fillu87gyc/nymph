/**
 * `nymph <file> --annotate <out.md>` の I/O 側。
 *
 * Markdown の組み立ては `markdownAnnotate.ts`（純粋）に置き、ここは
 * 「本文とレビューデータを読む → 書き出す」だけを担う。`exportCommand.ts`
 * と同じ分け方で、出力先の検証まで含めてテストできるようにしてある。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CommentStatus } from './client/types.ts';
import { annotateMarkdown } from './markdownAnnotate.ts';
import { readComments, readRound } from './reviewStore.ts';

export interface AnnotateResult {
  /** 書き出した Markdown の絶対パス */
  outPath: string;
  /** 元にした Markdown の絶対パス */
  file: string;
  /** 書き戻したコメント件数 */
  written: number;
  /** 除外した（解決済みの）コメント件数 */
  skipped: number;
  /** 書き戻したコメントの状態別内訳 */
  counts: Record<CommentStatus, number>;
}

export interface AnnotateToFileOptions {
  /** 生成日時（テストから固定するため注入可能） */
  generatedAt?: Date;
  /** 解決済みコメントも書き戻すか（既定: true） */
  includeResolved?: boolean;
}

/**
 * Markdown と保存済みコメントから、コメント入りの Markdown を書き出す。
 *
 * 出力先の親ディレクトリが無ければ作る（`--annotate out/review.md` を
 * 通すため）。**元ファイルへの上書きは拒否する**——レビュー対象を書き換え
 * ないのがこのツールの前提で、書き戻しはあくまで別ファイルへの出力にする。
 */
export function annotateToFile(
  file: string,
  outPath: string,
  options: AnnotateToFileOptions = {},
): AnnotateResult {
  const absFile = resolve(file);
  const absOut = resolve(outPath);

  if (absOut === absFile) {
    throw new Error(
      '書き戻し先が元ファイルと同じです（レビュー対象は上書きしません）',
    );
  }

  const content = readFileSync(absFile, 'utf-8');
  const comments = readComments(absFile);
  const round = readRound(absFile);

  const result = annotateMarkdown({
    file: absFile,
    content,
    comments,
    round,
    generatedAt: options.generatedAt,
    includeResolved: options.includeResolved,
  });

  const outDir = dirname(absOut);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(absOut, result.markdown, 'utf-8');

  return {
    outPath: absOut,
    file: absFile,
    written: result.written,
    skipped: result.skipped,
    counts: result.counts,
  };
}
