/**
 * コメントの Markdown 書き戻し（`nymph <file> --annotate <out.md>`）。
 *
 * レビュー結果を Markdown のまま持ち出すための出力。HTML エクスポートが
 * 「読ませる配布物」なのに対し、こちらは **元の文章のまま編集を続けられる形**
 * で指摘を返すためのもの——書き手（人でも AI でも）は本文の隣に指摘がある
 * Markdown を受け取り、そのまま直して次のラウンドに進める。
 *
 * 形式は各ブロックの直後に置く引用ブロック:
 *
 * ```
 * > [nymph] 未解決 · L3 · ラウンド 2
 * >
 * > 主語が曖昧です
 * ```
 *
 * 設計上の約束:
 *  - 本文の行は書き換えない。足すのは引用ブロックと末尾セクション、そして
 *    それらを区切るための空行だけ（差分を見たときに「増えた行」しか出ない）
 *  - 引用の前後には必ず空行を置く。空行が無いと直後の本文が引用の
 *    lazy continuation として吸われ、**元の文書の意味が変わる**
 *  - 行番号（L3）は**元ファイル基準**。引用を挿し込んだ時点で以降の行は
 *    ずれるため、書き戻した Markdown の行番号とは一致しない
 *  - 出力先は元ファイルと別にする（上書きは `annotateCommand.ts` で拒否する）。
 *    レビュー対象を書き換えないという設計原則をここでも守る
 *
 * ブロックの分割・コメントの割り当て・状態判定は HTML エクスポートと共有する
 * （`reviewBlocks.ts` / `commentStatus`）。出力ごとに解釈がずれないようにする。
 */

import { dirname } from 'node:path';
import {
  COMMENT_STATUS_LABEL,
  commentStatus,
  ctxDisplay,
} from './client/lib/comments.ts';
import type { Comment, CommentStatus } from './client/types.ts';
import {
  anchorComments,
  buildReviewBlocks,
  createBlockRenderer,
  findOrphanedIds,
} from './reviewBlocks.ts';

/** 書き戻した引用ブロックの目印。人が読んでも grep しても分かる形にする。 */
export const ANNOTATION_MARKER = '[nymph]';

/** 本文に紐づかないコメント（対象が消えた指摘・差分への指摘）の見出し。 */
export const UNANCHORED_HEADING = '本文に紐づかないコメント';

export interface AnnotateInput {
  /** レビュー対象の絶対パス（相対リンクの基準に使う）。 */
  file: string;
  /** Markdown 本文。 */
  content: string;
  /** 保存済みコメント。 */
  comments: Comment[];
  /** レビューラウンド（`comments.json` の round）。 */
  round?: number;
  /** 生成日時（テストから固定するため注入可能）。 */
  generatedAt?: Date;
  /** 解決済みコメントも書き戻すか（既定: true）。 */
  includeResolved?: boolean;
}

export interface AnnotateOutput {
  /** 書き戻し済みの Markdown 全文。 */
  markdown: string;
  /** 実際に書き戻したコメント件数。 */
  written: number;
  /** `includeResolved: false` で除いたコメント件数。 */
  skipped: number;
  /** 書き戻したコメントの状態別内訳。 */
  counts: Record<CommentStatus, number>;
}

function lineRef(c: Comment): string {
  return c.lineStart === c.lineEnd
    ? `L${c.lineStart}`
    : `L${c.lineStart}-${c.lineEnd}`;
}

function formatDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 引用の各行に `> ` を付ける（空行は `>` 単体。行末の空白を残さない）。 */
function quote(lines: string[]): string[] {
  return lines.map((l) => (l.length > 0 ? `> ${l}` : '>'));
}

/**
 * コメント 1 件を引用ブロックの行配列にする。
 *
 * ヘッダー・対象・本文のあいだに空の引用行を挟むのは見た目のためではない。
 * 引用の中で連続した行は 1 つの段落にまとめられるため、空行が無いと
 * 「[nymph] 未解決 · L3 主語が曖昧です」と地続きに表示されてしまう。
 */
export function annotationLines(c: Comment, status: CommentStatus): string[] {
  const head = [
    `${ANNOTATION_MARKER} ${COMMENT_STATUS_LABEL[status]}`,
    lineRef(c),
  ];
  if (typeof c.round === 'number' && c.round > 0)
    head.push(`ラウンド ${c.round}`);
  if (c.createdAt) head.push(formatDateTime(new Date(c.createdAt)));

  const body: string[] = [head.join(' · ')];

  // 対象の引用は、本文のどこを指しているかが直前のブロックだけでは
  // 分からないもの（選択・表・コード・差分）にだけ添える。ブロック全体への
  // 指摘で本文をもう一度書き写しても、増えるのはノイズだけなので出さない。
  const target = ctxDisplay(c);
  if (target && c.block_type !== 'paragraph' && c.block_type !== 'heading') {
    body.push('', `対象: ${target}`);
  }

  body.push('', ...c.text.split('\n'));
  return quote(body);
}

/**
 * コメントを本文へ書き戻した Markdown を返す。
 *
 * 副作用なし（`content` と `comments` だけから決まる）。
 */
export function annotateMarkdown(input: AnnotateInput): AnnotateOutput {
  const {
    file,
    content,
    comments,
    round = 0,
    generatedAt = new Date(),
    includeResolved = true,
  } = input;

  // 画像の埋め込みは HTML エクスポート専用。ここは本文をそのまま出すので
  // ファイルを読みに行かない（この関数を純粋に保つ）。
  const md = createBlockRenderer(dirname(file), false);
  const blocks = buildReviewBlocks(content, md);
  const orphaned = findOrphanedIds(blocks, comments);

  const withStatus = comments.map((c) => ({
    ...c,
    __status: commentStatus(c, orphaned.has(c.id)),
  }));
  const target = includeResolved
    ? withStatus
    : withStatus.filter((c) => c.__status !== 'resolved');

  const counts: Record<CommentStatus, number> = {
    open: 0,
    deleted: 0,
    resolved: 0,
  };
  for (const c of target) counts[c.__status]++;

  const { attached, unanchored } = anchorComments(blocks, target);

  // ブロックの終端行 → そこへ挿し込む引用ブロック（複数可）
  const insertions = new Map<number, string[][]>();
  for (const block of blocks) {
    const here = attached.get(block) ?? [];
    if (here.length === 0) continue;
    const at = insertions.get(block.lineEnd) ?? [];
    for (const c of here) at.push(annotationLines(c, c.__status));
    insertions.set(block.lineEnd, at);
  }

  const lines = content.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const here = insertions.get(i + 1);
    if (!here) continue;

    // 直前が本文なら空行で切る（引用がブロックへ吸われないように）
    if ((out[out.length - 1] ?? '').trim() !== '') out.push('');
    here.forEach((block, idx) => {
      if (idx > 0) out.push(''); // 引用同士も空行で分ける（別々の引用にする）
      out.push(...block);
    });
    // 直後が本文なら空行で切る（本文が引用の続きとして吸われないように）
    if ((lines[i + 1] ?? '').trim() !== '') out.push('');
  }

  const tail: string[] = [];
  if (unanchored.length > 0) {
    tail.push(
      '',
      '---',
      '',
      `## ${UNANCHORED_HEADING}（${unanchored.length}）`,
      '',
    );
    unanchored.forEach((c, idx) => {
      if (idx > 0) tail.push('');
      tail.push(...annotationLines(c, c.__status));
    });
  }

  // 出力そのものの素性は HTML コメントで残す。表示には出ないので、
  // 書き戻した Markdown をそのまま清書に回しても邪魔にならない。
  const summary = [
    `${formatDateTime(generatedAt)} 出力`,
    `コメント ${target.length} 件（未解決 ${counts.open} / 削除済 ${counts.deleted} / 解決済 ${counts.resolved}）`,
  ];
  if (round > 0) summary.push(`ラウンド ${round}`);
  if (comments.length - target.length > 0)
    summary.push(`解決済 ${comments.length - target.length} 件は除外`);
  tail.push('', `<!-- nymph: ${summary.join(' · ')} -->`);

  // 本文末尾の空行と footer が二重にならないよう、末尾を整えてから足す。
  while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') out.pop();

  return {
    markdown: `${[...out, ...tail].join('\n')}\n`,
    written: target.length,
    skipped: comments.length - target.length,
    counts,
  };
}
