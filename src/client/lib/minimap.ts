/**
 * ミニマップの行モデル。
 *
 * VSCode のミニマップのようなピクセル忠実な縮小は、本文を 2 回描くことになって
 * 重い。nymph が欲しいのは「どこに何があるか」「コメントが集まっているのはどこか」
 * の俯瞰なので、1 行 = 1 本の棒（種別で色分け、長さで太さ）に潰した疑似
 * ミニマップにする。行数が多い文書では複数行を 1 本に束ねて、DOM の本数を
 * 一定に保つ。
 */

export type MinimapKind =
  | 'heading'
  | 'code'
  | 'quote'
  | 'list'
  | 'table'
  | 'text'
  | 'blank';

export interface MinimapRow {
  /** この棒が代表する先頭行（1 始まり）。クリック時のジャンプ先。 */
  line: number;
  /** この棒が代表する最終行。 */
  lineEnd: number;
  kind: MinimapKind;
  /** 棒の長さ（0〜1）。行の文字数に比例させる。 */
  weight: number;
}

/** 棒の本数の上限。これを超える文書は複数行を 1 本に束ねる。 */
export const MAX_MINIMAP_ROWS = 300;
/** 棒の長さが頭打ちになる文字数。 */
const FULL_WIDTH_CHARS = 80;

const KIND_PRIORITY: MinimapKind[] = [
  'heading',
  'code',
  'table',
  'quote',
  'list',
  'text',
  'blank',
];

function lineKind(text: string, fenced: boolean): MinimapKind {
  if (fenced) return 'code';
  const t = text.trim();
  if (!t) return 'blank';
  if (/^#{1,6}\s/.test(t)) return 'heading';
  if (t.startsWith('>')) return 'quote';
  if (t.startsWith('|')) return 'table';
  if (/^([-*+]|\d+[.)])\s/.test(t)) return 'list';
  if (/^ {4,}\S/.test(text)) return 'code';
  return 'text';
}

/**
 * 本文をミニマップの棒に変換する。`maxRows` を超える行数の文書では、
 * 連続する行を束ねて 1 本にする（種別は優先度の高いもの、長さは最大値）。
 */
export function buildMinimapRows(
  src: string,
  maxRows: number = MAX_MINIMAP_ROWS,
): MinimapRow[] {
  const lines = src.split('\n');
  // 末尾の改行だけの行は棒にしない（空の余白が伸びて見えるため）
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 1 && lines[0] === '') return [];

  const kinds: MinimapKind[] = [];
  const weights: number[] = [];
  let fence: string | null = null;
  for (const text of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(text);
    const isFenceEdge = m !== null;
    if (isFenceEdge) fence = fence === null ? m[1][0] : null;
    kinds.push(lineKind(text, fence !== null || isFenceEdge));
    weights.push(Math.min(1, text.trim().length / FULL_WIDTH_CHARS));
  }

  const bucket = Math.max(1, Math.ceil(lines.length / maxRows));
  const rows: MinimapRow[] = [];
  for (let i = 0; i < lines.length; i += bucket) {
    const end = Math.min(i + bucket, lines.length);
    let kind: MinimapKind = 'blank';
    let weight = 0;
    for (let j = i; j < end; j++) {
      if (KIND_PRIORITY.indexOf(kinds[j]) < KIND_PRIORITY.indexOf(kind))
        kind = kinds[j];
      weight = Math.max(weight, weights[j]);
    }
    rows.push({ line: i + 1, lineEnd: end, kind, weight });
  }
  return rows;
}

/** 本文の総行数（ミニマップ上の位置と行番号の換算に使う）。 */
export function countLines(src: string): number {
  return src === '' ? 0 : src.split('\n').length;
}

/** ミニマップ上の縦位置（0〜1）を行番号に直す。 */
export function lineAtRatio(ratio: number, totalLines: number): number {
  if (totalLines <= 0) return 1;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.min(
    totalLines,
    Math.max(1, Math.round(clamped * totalLines) || 1),
  );
}

/** 行番号をミニマップ上の縦位置（0〜1）に直す。 */
export function ratioAtLine(line: number, totalLines: number): number {
  if (totalLines <= 0) return 0;
  return Math.min(1, Math.max(0, (line - 1) / totalLines));
}
