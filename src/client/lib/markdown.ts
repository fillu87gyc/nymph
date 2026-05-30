import { type Token, marked, Renderer } from 'marked';
import type { Comment, DiffLine } from '../types.ts';

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

function esc(str: string): string {
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

export function getBlockTokensDFS(tokens: any[]): any[] {
  const result: any[] = [];
  for (const t of tokens) {
    if (!BLOCK_TYPES.has(t.type)) continue;
    if (t.tokens) result.push(...getBlockTokensDFS(t.tokens));
    if (t.type === 'list' && t.items) {
      for (const item of t.items)
        result.push(...getBlockTokensDFS(item.tokens || []));
    }
    result.push(t);
  }
  return result;
}

export function restoreIndicators(container: HTMLElement, comments: Comment[]) {
  container.querySelectorAll('.md-block').forEach((b) => {
    const el = b as HTMLElement;
    const ls = +el.dataset.ls!,
      le = +el.dataset.le!;
    el.classList.toggle(
      'has-comment',
      comments.some((c) => c.ls <= le && c.le >= ls),
    );
  });
}

export function applyDiffHighlight(
  container: HTMLElement,
  diffMode: boolean,
  diffData: { lines: DiffLine[] } | null,
) {
  container.querySelectorAll('.md-block').forEach((el) => {
    el.classList.remove('diff-changed');
    el.querySelectorAll('.diff-side').forEach((h) => h.remove());
    delete (el as any)._diffGroups;
  });

  if (!diffMode || !diffData) return;

  const groups = new Map<
    number,
    { inserts: DiffLine[]; deletes: DiffLine[] }
  >();
  for (const l of diffData.lines) {
    if (l.g == null) continue;
    if (!groups.has(l.g)) groups.set(l.g, { inserts: [], deletes: [] });
    const g = groups.get(l.g)!;
    if (l.type === 'insert') g.inserts.push(l);
    else if (l.type === 'delete') g.deletes.push(l);
  }

  container.querySelectorAll('.md-block').forEach((el) => {
    const ls = parseInt((el as HTMLElement).dataset.ls!, 10);
    const le = parseInt((el as HTMLElement).dataset.le!, 10);
    const matched: Array<{ inserts: DiffLine[]; deletes: DiffLine[] }> = [];
    for (const [, g] of groups) {
      if (
        g.inserts.some(
          (l) =>
            l.n != null && l.n >= ls && l.n <= le && l.content.trim() !== '',
        )
      ) {
        matched.push(g);
      }
    }
    if (!matched.length) return;

    el.classList.add('diff-changed');
    const delSide = document.createElement('div');
    delSide.className = 'diff-side diff-side-del';
    const insSide = document.createElement('div');
    insSide.className = 'diff-side diff-side-ins';
    for (const g of matched) {
      for (const d of g.deletes) {
        const span = document.createElement('span');
        span.className = 'diff-del';
        span.textContent = `− ${d.content || ' '}`;
        delSide.appendChild(span);
      }
      for (const ins of g.inserts) {
        if (!ins.content.trim()) continue;
        const span = document.createElement('span');
        span.className = 'diff-ins';
        span.textContent = `+ ${ins.content}`;
        insSide.appendChild(span);
      }
    }
    if (delSide.children.length) el.appendChild(delSide);
    if (insSide.children.length) el.appendChild(insSide);
  });
}

export function scrollToLine(container: HTMLElement, c: Comment) {
  const b = container.querySelector(
    `.md-block[data-ls="${c.ls}"]`,
  ) as HTMLElement | null;
  if (!b) return;
  b.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (c.block_type === 'selection' && typeof c.context === 'string') {
    highlightSelectionText(
      container,
      c.ls,
      c.le,
      c.context,
      c.selection_offset ?? null,
    );
  } else {
    b.style.outline = '2px solid var(--accent)';
    b.style.outlineOffset = '4px';
    setTimeout(() => {
      b.style.outline = '';
      b.style.outlineOffset = '';
    }, 1400);
  }
}

function highlightSelectionText(
  container: HTMLElement,
  ls: number,
  le: number,
  searchText: string,
  selectionOffset: number | null,
) {
  if (!searchText) return;
  const needle = searchText.endsWith('…')
    ? searchText.slice(0, -1)
    : searchText;

  const blocks = [...container.querySelectorAll('.md-block')].filter((b) => {
    const bls = +(b as HTMLElement).dataset.ls!,
      ble = +(b as HTMLElement).dataset.le!;
    return bls <= le && ble >= ls;
  });

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
      const end = start + n.textContent?.length;
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
      const mark = document.createElement('mark');
      mark.className = 'text-highlight';
      range.surroundContents(mark);
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const p = mark.parentNode;
        if (p) {
          while (mark.firstChild) p.insertBefore(mark.firstChild, mark);
          p.removeChild(mark);
        }
      }, 2000);
    } catch {
      const el = block as HTMLElement;
      el.style.outline = '2px solid var(--accent)';
      el.style.outlineOffset = '4px';
      setTimeout(() => {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }, 1400);
    }
    return;
  }
}

type AddCommentCb = (
  ls: number,
  le: number,
  displayCtx: string,
  blockType: string,
  context: any,
  selectionOffset: number | null,
) => void;
type OpenDrawioCb = (code: string) => void;

let mermaidSeq = 0;

export async function renderMarkdown(
  container: HTMLElement,
  welcomeEl: HTMLElement,
  src: string,
  onAddComment: AddCommentCb,
  onOpenDrawio: OpenDrawioCb,
) {
  if (!src.trim()) {
    container.innerHTML = '';
    container.appendChild(welcomeEl);
    welcomeEl.classList.remove('hidden');
    return;
  }
  welcomeEl.classList.add('hidden');

  const tokens = marked.lexer(src);
  assignLines(src, tokens);
  const blockTokens = getBlockTokensDFS(tokens);
  let idx = 0;

  const renderer = new Renderer();

  function wrap(inner: string, type: string, extra = '') {
    const t = blockTokens[idx++] || {};
    const ls = t.ls || 1,
      le = t.le || ls;
    return (
      `<div class="md-block" data-ls="${ls}" data-le="${le}" data-block-type="${type}"${extra}>` +
      `<button class="comment-btn" aria-label="コメント">＋</button>` +
      inner +
      '</div>'
    );
  }

  (renderer as any).paragraph = (text: string) =>
    wrap(`<p>${text}</p>`, 'paragraph');
  (renderer as any).heading = (text: string, level: number) =>
    wrap(`<h${level}>${text}</h${level}>`, 'heading');
  (renderer as any).blockquote = (q: string) =>
    wrap(`<blockquote>${q}</blockquote>`, 'blockquote');
  (renderer as any).list = (
    body: string,
    ordered: boolean,
    start: number | '',
  ) => {
    const tag = ordered ? `ol${start !== 1 ? ` start="${start}"` : ''}` : 'ul';
    return wrap(`<${tag}>${body}</${tag}>`, 'list');
  };
  (renderer as any).hr = () => wrap('<hr>', 'hr');
  (renderer as any).html = (html: string) => wrap(html, 'html');

  (renderer as any).table = (header: string, body: string) => {
    const t = blockTokens[idx] || {};
    let extra = '';
    if (t.header) {
      const headers = t.header.map((cell: any) => cell.text || '');
      const rows = (t.rows || []).map((row: any[]) =>
        Object.fromEntries(
          row.map((cell: any, i: number) => [headers[i] ?? i, cell.text || '']),
        ),
      );
      extra = ` data-table-ctx="${esc(JSON.stringify({ headers, rows }))}"`;
    }
    return wrap(
      `<table><thead>${header}</thead><tbody>${body}</tbody></table>`,
      'table',
      extra,
    );
  };

  (renderer as any).code = (code: string, lang: string | undefined) => {
    const t = blockTokens[idx++] || {};
    const ls = t.ls || 1,
      le = t.le || ls;
    if (lang === 'mermaid' || lang === 'mmd') {
      mermaidSeq++;
      const mid = `mermaid-${mermaidSeq}`;
      const enc = encodeURIComponent(code);
      return (
        `<div class="md-block" data-ls="${ls}" data-le="${le}" data-block-type="mermaid">` +
        `<button class="comment-btn">＋</button>` +
        `<div class="mermaid-wrap">` +
        `<div class="mermaid-bar">` +
        `<span class="mermaid-label"><em>Mermaid</em> Diagram</span>` +
        `<button class="btn-drawio" data-code="${enc}">→ draw.io</button>` +
        `</div>` +
        `<div class="mermaid-area"><div class="mermaid" id="${mid}">${esc(code)}</div></div>` +
        `</div></div>`
      );
    }
    return (
      `<div class="md-block" data-ls="${ls}" data-le="${le}" data-block-type="code">` +
      `<button class="comment-btn">＋</button>` +
      `<pre><code class="language-${esc(lang || 'plaintext')}">${esc(code)}</code></pre>` +
      `</div>`
    );
  };

  const html = marked.parse(src, { renderer }) as string;
  mermaidSeq = 0;
  idx = 0;

  container.innerHTML = html;
  container.appendChild(welcomeEl);

  // Mermaid
  try {
    const { default: mermaid } = await import('mermaid');
    const dark = document.documentElement.dataset.theme !== 'light';
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: '"JetBrains Mono", monospace',
    });
    await mermaid.run({ querySelector: '#content .mermaid' });
  } catch (e) {
    console.warn('mermaid:', e);
  }

  // highlight.js
  try {
    const { default: hljs } = await import('highlight.js');
    container.querySelectorAll('pre code').forEach((el) => {
      try {
        hljs.highlightElement(el as HTMLElement);
      } catch (e) {
        console.warn('hljs:', e);
      }
    });
  } catch {
    /* not available */
  }

  // Attach comment button handlers
  container.querySelectorAll('.comment-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = (btn as HTMLElement).closest('.md-block') as HTMLElement;
      const ls = +b.dataset.ls!,
        le = +b.dataset.le!;
      const blockType = b.dataset.blockType || 'paragraph';
      let context: any, displayCtx: string;

      if (blockType === 'table' && b.dataset.tableCtx) {
        context = JSON.parse(b.dataset.tableCtx);
        displayCtx = context.headers.join(' | ');
      } else if (blockType === 'code' || blockType === 'mermaid') {
        const srcLines = src.split('\n');
        const raw = srcLines.slice(ls - 1, le).join('\n');
        const codeLines = raw.split('\n');
        const langRaw = codeLines[0].replace(/^```+/, '').trim() || null;
        const code = codeLines
          .slice(
            1,
            codeLines[codeLines.length - 1].trimStart().startsWith('```')
              ? -1
              : undefined,
          )
          .join('\n');
        context = langRaw ? { lang: langRaw, code } : { code };
        displayCtx = codeLines[1] || '';
      } else {
        const srcLines = src.split('\n');
        context = srcLines.slice(ls - 1, Math.min(ls + 2, le)).join('\n');
        displayCtx = context.split('\n')[0];
      }

      onAddComment(ls, le, displayCtx, blockType, context, null);
    });
  });

  // Attach draw.io handlers
  container.querySelectorAll('.btn-drawio').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpenDrawio(decodeURIComponent((btn as HTMLElement).dataset.code || ''));
    });
  });
}
