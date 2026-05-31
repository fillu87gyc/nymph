import type { Token } from 'marked';

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
  for (const t of tokens) {
    if (!t.raw) continue;
    const idx = src.indexOf(t.raw, from);
    if (idx === -1) continue;
    const before = src.substring(0, idx);
    (t as any).ls = before.split('\n').length;
    (t as any).le = (t as any).ls + lineCount(t.raw) - 1;
    from = idx + t.raw.length;

    if (t.type === 'blockquote' && (t as any).tokens) {
      const innerSrc = t.raw
        .split('\n')
        .map((l: string) => l.replace(/^>[ ]?/, ''))
        .join('\n');
      assignLinesInner(innerSrc, (t as any).tokens, (t as any).ls);
    }
    if (t.type === 'list' && (t as any).items) {
      for (const item of (t as any).items) {
        if (!item.tokens || !item.raw) continue;
        const iIdx = src.indexOf(item.raw, 0);
        if (iIdx === -1) continue;
        const iLs = src.substring(0, iIdx).split('\n').length;
        const itemInner = item.raw
          .split('\n')
          .map((l: string, i: number) =>
            i === 0 ? l.replace(/^[-*+\d.]+\s+/, '') : l,
          )
          .join('\n');
        assignLinesInner(itemInner, item.tokens, iLs);
      }
    }
  }
}

function assignLinesInner(innerSrc: string, tokens: any[], lineOffset: number) {
  let from = 0;
  for (const t of tokens) {
    if (!t.raw || !BLOCK_TYPES.has(t.type)) continue;
    const idx = innerSrc.indexOf(t.raw, from);
    if (idx === -1) continue;
    const before = innerSrc.substring(0, idx);
    t.ls = lineOffset + before.split('\n').length - 1;
    t.le = t.ls + lineCount(t.raw) - 1;
    from = idx + t.raw.length;
  }
}

export function getBlockTokensDFS(tokens: any[], nested = false): any[] {
  const result: any[] = [];
  for (const t of tokens) {
    if (!BLOCK_TYPES.has(t.type)) continue;
    const isContainer = t.type === 'blockquote';
    if (t.tokens)
      result.push(...getBlockTokensDFS(t.tokens, nested || isContainer));
    if (t.type === 'list' && t.items) {
      for (const item of t.items)
        result.push(...getBlockTokensDFS(item.tokens || [], true));
    }
    (t as any).__nested = nested;
    result.push(t);
  }
  return result;
}

export function highlightSelectionText(
  blocks: HTMLElement[],
  ls: number,
  _le: number,
  searchText: string,
  selectionOffset: number | null,
  onFallback: (ls: number) => void,
): void {
  if (!searchText) return;
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

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    try {
      // CSS Custom Highlight API — no DOM mutation needed
      const hl = (CSS as any).highlights as Map<string, unknown> | undefined;
      if (hl) {
        hl.set('text-highlight', new (window as any).Highlight(range));
        setTimeout(() => hl.delete('text-highlight'), 2000);
      } else {
        onFallback(ls);
      }
    } catch {
      onFallback(ls);
    }
    return;
  }
}
