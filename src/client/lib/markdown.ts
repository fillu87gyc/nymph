import type { MarkedToken, Token } from 'marked';

// marked のトークンに行番号メタ（ソース上の開始/終了行）を後付けするための拡張。
// marked 自体は行番号を持たないため assignLines / getBlockTokensDFS で付与する。
export interface LineMeta {
  lineStart: number;
  lineEnd: number;
  __nested?: boolean;
}

// MarkedToken（index signature を持つ Tokens.Generic を含まない判別可能 union）を
// ベースにし、distributive conditional で union を分配することで t.type による
// narrowing を保つ。Token そのものに & すると Generic が混入し narrowing が壊れる。
export type PositionedToken = MarkedToken extends infer T
  ? T & LineMeta
  : never;

export const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'code',
  'blockquote',
  'list',
  'hr',
  'table',
  'html',
]);

export function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Strip all trailing newlines before counting lines
function lineCount(raw: string): number {
  return raw.replace(/\n+$/, '').split('\n').length;
}

export function assignLines(src: string, tokens: Token[]) {
  let from = 0;
  for (const t of tokens as MarkedToken[]) {
    if (!t.raw) continue;
    const idx = src.indexOf(t.raw, from);
    if (idx === -1) continue;
    const before = src.substring(0, idx);
    const meta = t as MarkedToken & LineMeta;
    meta.lineStart = before.split('\n').length;
    meta.lineEnd = meta.lineStart + lineCount(t.raw) - 1;
    from = idx + t.raw.length;

    if (t.type === 'blockquote' && t.tokens) {
      const innerSrc = t.raw
        .split('\n')
        .map((l) => l.replace(/^>[ ]?/, ''))
        .join('\n');
      assignLinesInner(innerSrc, t.tokens, meta.lineStart);
    }
    if (t.type === 'list' && t.items) {
      for (const item of t.items) {
        if (!item.tokens || !item.raw) continue;
        const iIdx = src.indexOf(item.raw, 0);
        if (iIdx === -1) continue;
        const itemLineStart = src.substring(0, iIdx).split('\n').length;
        const itemInner = item.raw
          .split('\n')
          .map((l, i) => (i === 0 ? l.replace(/^[-*+\d.]+\s+/, '') : l))
          .join('\n');
        assignLinesInner(itemInner, item.tokens, itemLineStart);
      }
    }
  }
}

function assignLinesInner(
  innerSrc: string,
  tokens: Token[],
  lineOffset: number,
) {
  let from = 0;
  for (const t of tokens) {
    if (!t.raw || !BLOCK_TYPES.has(t.type)) continue;
    const idx = innerSrc.indexOf(t.raw, from);
    if (idx === -1) continue;
    const before = innerSrc.substring(0, idx);
    const meta = t as Token & LineMeta;
    meta.lineStart = lineOffset + before.split('\n').length - 1;
    meta.lineEnd = meta.lineStart + lineCount(t.raw) - 1;
    from = idx + t.raw.length;
  }
}

export function getBlockTokensDFS(
  tokens: Token[],
  nested = false,
): PositionedToken[] {
  const result: PositionedToken[] = [];
  for (const t of tokens as MarkedToken[]) {
    if (!BLOCK_TYPES.has(t.type)) continue;
    const isContainer = t.type === 'blockquote';
    if ('tokens' in t && t.tokens)
      result.push(...getBlockTokensDFS(t.tokens, nested || isContainer));
    if (t.type === 'list' && t.items) {
      for (const item of t.items)
        result.push(...getBlockTokensDFS(item.tokens || [], true));
    }
    const meta = t as PositionedToken;
    meta.__nested = nested;
    result.push(meta);
  }
  return result;
}

export function findTextRange(
  blocks: HTMLElement[],
  searchText: string,
  selectionOffset: number | null,
): Range | null {
  if (!searchText) return null;
  const needle = searchText.endsWith('…')
    ? searchText.slice(0, -1)
    : searchText;

  for (const block of blocks) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let node: Text | null,
      accumulated = '';
    const nodes: Array<{ node: Text; start: number }> = [];
    while ((node = walker.nextNode() as Text | null)) {
      nodes.push({ node, start: accumulated.length });
      accumulated += node.textContent;
    }

    let idx =
      selectionOffset != null
        ? accumulated.indexOf(needle, selectionOffset)
        : accumulated.indexOf(needle);
    if (idx === -1 && selectionOffset != null)
      idx = accumulated.indexOf(needle);
    if (idx === -1) continue;

    let startNode: Text | undefined,
      startOffset = 0,
      endNode: Text | undefined,
      endOffset = 0;
    for (const { node: n, start } of nodes) {
      const end = start + (n.textContent?.length ?? 0);
      if (!startNode && idx < end) {
        startNode = n;
        startOffset = idx - start;
      }
      if (!endNode && idx + needle.length <= end) {
        endNode = n;
        endOffset = idx + needle.length - start;
        break;
      }
    }
    if (!startNode || !endNode) continue;

    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    } catch {
      continue;
    }
  }
  return null;
}

export function highlightSelectionText(
  blocks: HTMLElement[],
  lineStart: number,
  _lineEnd: number,
  searchText: string,
  selectionOffset: number | null,
  onFallback: (lineStart: number) => void,
): void {
  const range = findTextRange(blocks, searchText, selectionOffset);
  if (!range) return;

  try {
    // CSS Custom Highlight API は未対応ブラウザでは undefined になりうる。
    const highlightRegistry = CSS.highlights as HighlightRegistry | undefined;
    if (highlightRegistry) {
      const highlight = new Highlight(range);
      highlight.priority = 1;
      highlightRegistry.set('text-highlight', highlight);
      setTimeout(() => highlightRegistry.delete('text-highlight'), 2000);
    } else {
      onFallback(lineStart);
    }
  } catch {
    onFallback(lineStart);
  }
}
