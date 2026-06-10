import type { DiffLine } from '../types.ts';

// split ビューの 1 行。left = checkpoint（旧）側、right = 現在（新）側。
// pair はグループ内の削除/追加が 1:1 対応し文字単位ハイライトできることを示す。
export interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
  pair: boolean;
}

// /diff のフラットな行列（equal / 同一 g の delete→insert 連続）を
// GitHub の split ビューと同じ「左右に並ぶ行」へ変換する。
export function buildSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'equal') {
      rows.push({ left: line, right: line, pair: false });
      i++;
      continue;
    }

    // 同一グループの delete / insert をまとめて取り出す
    // （computeDiff は delete 群 → insert 群 の順で出力する）
    const g = line.g;
    const deletes: DiffLine[] = [];
    const inserts: DiffLine[] = [];
    while (i < lines.length && lines[i].g === g && lines[i].type !== 'equal') {
      if (lines[i].type === 'delete') deletes.push(lines[i]);
      else inserts.push(lines[i]);
      i++;
    }

    const pair = deletes.length === inserts.length && deletes.length > 0;
    const rowCount = Math.max(deletes.length, inserts.length);
    for (let r = 0; r < rowCount; r++) {
      rows.push({
        left: deletes[r] ?? null,
        right: inserts[r] ?? null,
        pair,
      });
    }
  }

  return rows;
}
