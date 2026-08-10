/**
 * 保存済みコメントの CSV 化（`nymph export <file>`）。
 *
 * レビュー結果を表計算・課題管理・スクリプトへ流すための出力。HTML / Markdown
 * が「読ませる」出力なのに対し、こちらは **1 コメント = 1 行の表** として
 * 機械に渡すためのもの。
 *
 * 決めごと:
 *  - 区切りは RFC 4180（`"` は `""`、改行やカンマを含む値は引用、行末は CRLF）。
 *    Excel / Numbers / LibreOffice / `csv` モジュールがそのまま読める形にする
 *  - 見出し行は英字スネークケース。人向けの表示ではなく後段の処理が読む列名なので、
 *    `status` の値も `open` / `deleted` / `resolved`（`CommentStatus` そのもの）にする
 *  - 表計算の数式として解釈されうる値は無害化する（下の `neutralize` 参照）
 *
 * 状態判定とブロックの分割は他の出力と共有する（`reviewBlocks.ts` /
 * `commentStatus`）。CSV だけ「削除済」の見え方が違う、を作らない。
 */

import { basename, dirname } from 'node:path';
import { commentStatus, ctxDisplay } from './client/lib/comments.ts';
import type { Comment } from './client/types.ts';
import {
  buildReviewBlocks,
  createBlockRenderer,
  findOrphanedIds,
} from './reviewBlocks.ts';

/** Excel（Windows）に UTF-8 として読ませるための BOM。 */
const UTF8_BOM = '\uFEFF';

/** 見出し行。後段のスクリプトが列名で引けるよう、順序も含めて固定する。 */
export const CSV_COLUMNS = [
  'file',
  'id',
  'status',
  'line_start',
  'line_end',
  'block_type',
  'round',
  'created_at',
  'target',
  'comment',
] as const;

export interface CsvInput {
  /** レビュー対象の絶対パス（`file` 列と相対リンクの基準に使う）。 */
  file: string;
  /** Markdown 本文（状態判定に要る）。 */
  content: string;
  /** 保存済みコメント。 */
  comments: Comment[];
  /** 先頭に UTF-8 BOM を付けるか（既定: false）。 */
  bom?: boolean;
}

/**
 * 表計算ソフトが数式として解釈しうる値を無害化する。
 *
 * `=`・`+`・`@`・タブ・CR で始まるセルは Excel / Sheets が数式として評価する
 * （`=HYPERLINK(...)` のような細工がレビューコメントに混ざりうる）。先頭に
 * `'` を足して文字列として読ませる。`-` は除いてある——数式にはならない一方、
 * 日本語のレビューコメントは箇条書きの `- ` で始まることが多く、そちらを
 * 潰す方が実害が大きいため。
 */
function neutralize(value: string): string {
  return /^[=+@\t\r]/.test(value) ? `'${value}` : value;
}

/** RFC 4180 の 1 セル。引用が要るときだけ引用する。 */
export function csvField(value: string): string {
  const v = neutralize(value);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** 行配列を CSV 文字列にする（行末は CRLF、末尾も改行で終える）。 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** コメントを CSV の行（見出し行を除く）にする。 */
export function buildCommentRows(input: CsvInput): string[][] {
  const { file, content, comments } = input;

  const md = createBlockRenderer(dirname(file), false);
  const blocks = buildReviewBlocks(content, md);
  const orphaned = findOrphanedIds(blocks, comments);

  const name = basename(file);
  return comments.map((c) => [
    name,
    String(c.id),
    commentStatus(c, orphaned.has(c.id)),
    String(c.lineStart),
    String(c.lineEnd),
    c.block_type || '',
    typeof c.round === 'number' ? String(c.round) : '',
    c.createdAt ?? '',
    ctxDisplay(c),
    c.text,
  ]);
}

/**
 * 見出し行付きの CSV 全体を返す。
 *
 * `bom` は Excel 向け。BOM 無しの UTF-8 CSV を Excel（Windows）はレガシー
 * エンコーディングとして読むため日本語が化ける。既定を BOM 無しにしてあるのは、
 * `nymph export … | …` のようにそのまま次のコマンドへ渡す使い方で BOM が
 * 邪魔になるため（付けるかは呼び出し側が選ぶ）。
 */
export function renderCommentsCsv(input: CsvInput): string {
  const csv = toCsv([[...CSV_COLUMNS], ...buildCommentRows(input)]);
  return input.bom ? `${UTF8_BOM}${csv}` : csv;
}
