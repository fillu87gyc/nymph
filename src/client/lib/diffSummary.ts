/**
 * 差分サマリ。`/diff` の行の並びを「変更のかたまり（hunk）」に畳んで、
 * ±行数と代表行を出す。差分チェックモードを開かずに「何がどれだけ変わったか」
 * を眺め、気になったところへ飛べるようにするためのモデル。
 *
 * サーバー側 computeDiff が付ける `g`（変更グループの通し番号）をそのまま
 * かたまりの単位として使う。等しい行の `g` は null。
 */

import type { DiffLine } from '../types.ts';

export interface DiffHunk {
  /** サーバーが付けた変更グループ番号。 */
  g: number;
  added: number;
  deleted: number;
  /** ジャンプ先の行（差分チェックモードのハイライト対象）。 */
  line: number;
  /** ジャンプ先が新旧どちら側か。追加があれば新、削除だけなら旧。 */
  side: 'old' | 'new';
  /** 代表行の中身（一覧に出す短いプレビュー）。 */
  preview: string;
}

export interface DiffSummary {
  added: number;
  deleted: number;
  hunks: DiffHunk[];
}

export const EMPTY_DIFF_SUMMARY: DiffSummary = {
  added: 0,
  deleted: 0,
  hunks: [],
};

export function summarizeDiff(lines: DiffLine[]): DiffSummary {
  const byGroup = new Map<number, DiffHunk>();
  let added = 0;
  let deleted = 0;

  for (const l of lines) {
    if (l.g === null || l.type === 'equal') continue;
    let hunk = byGroup.get(l.g);
    if (!hunk) {
      hunk = {
        g: l.g,
        added: 0,
        deleted: 0,
        line: 0,
        side: 'new',
        preview: '',
      };
      byGroup.set(l.g, hunk);
    }
    if (l.type === 'insert') {
      added++;
      hunk.added++;
      // 追加行があれば新側を代表にする（レビューでは「今どうなったか」を見たい）
      if (hunk.added === 1) {
        hunk.side = 'new';
        hunk.line = l.n ?? 0;
        hunk.preview = l.content.trim();
      }
    } else {
      deleted++;
      hunk.deleted++;
      // 削除だけのかたまりでは旧側を代表にする（後で追加が来たら上書きされる）
      if (hunk.added === 0 && hunk.deleted === 1) {
        hunk.side = 'old';
        hunk.line = l.o ?? 0;
        hunk.preview = l.content.trim();
      }
    }
  }

  const hunks = [...byGroup.values()]
    .filter((h) => h.line > 0)
    .sort((a, b) => a.g - b.g);
  return { added, deleted, hunks };
}
