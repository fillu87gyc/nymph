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
  | 'diagram'
  | 'image'
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
  'diagram',
  'image',
  'code',
  'table',
  'quote',
  'list',
  'text',
  'blank',
];

/** 図として描かれるフェンス（本文の描画と同じ判定）。 */
const DIAGRAM_LANGS = new Set(['mermaid', 'mmd']);
/** フェンスの囲みと、その情報文字列（```mermaid の mermaid）。 */
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
/** その行が画像だけでできているか。文中の画像は本文として扱う。 */
const IMAGE_LINE_RE = /^!\[[^\]]*\]\([^)]*\)$/;

function lineKind(
  text: string,
  fenced: boolean,
  diagram: boolean,
): MinimapKind {
  if (fenced) return diagram ? 'diagram' : 'code';
  const t = text.trim();
  if (!t) return 'blank';
  if (/^#{1,6}\s/.test(t)) return 'heading';
  if (IMAGE_LINE_RE.test(t)) return 'image';
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
  let fence: { diagram: boolean } | null = null;
  for (const text of lines) {
    const m = FENCE_RE.exec(text);
    const isFenceEdge = m !== null;
    // 閉じの行も開いていたフェンスの種類で塗る（囲みごと 1 つの塊に見せる）
    let diagram: boolean = fence?.diagram ?? false;
    if (isFenceEdge) {
      if (fence === null) {
        diagram = DIAGRAM_LANGS.has(m[2].toLowerCase());
        fence = { diagram };
      } else {
        fence = null;
      }
    }
    kinds.push(lineKind(text, fence !== null || isFenceEdge, diagram));
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

/**
 * 今どこを見ているかの枠の下限の高さ（px）。
 * 上下の線（各 2px）が潰れず、中の塗りも残る高さにする。
 */
export const MIN_VIEWPORT_PX = 14;

/**
 * 今見ている範囲の枠を、線が読める高さに整える。
 *
 * 割合をそのまま使うと、長い文書では帯が数 px まで縮んで上下の枠線が
 * 重なり、ただの点にしか見えなくなる。下限まで伸ばしたうえで、はみ出す分は
 * 上へ寄せて棒の箱の中に収める（箱は overflow: hidden なので、はみ出すと
 * 下の枠線が切れて見えなくなる）。
 */
export function clampViewportBand(
  top: number,
  height: number,
  boxHeightPx: number,
): { top: number; height: number } {
  const clampedTop = Math.min(1, Math.max(0, top));
  const clampedHeight = Math.min(1, Math.max(0, height));
  if (boxHeightPx <= 0) return { top: clampedTop, height: clampedHeight };
  const h = Math.min(1, Math.max(clampedHeight, MIN_VIEWPORT_PX / boxHeightPx));
  return { top: Math.min(clampedTop, 1 - h), height: h };
}
