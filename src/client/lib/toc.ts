import { marked } from 'marked';
import { assignLines, getBlockTokensDFS } from './markdown.ts';
import { sanitizeHtml } from './sanitize.ts';

export interface TocItem {
  key: string;
  level: number;
  text: string;
  lineStart: number;
}

function headingText(raw: string): string {
  const html = sanitizeHtml(marked.parseInline(raw) as string);
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent?.trim() ?? '';
}

export function extractToc(src: string): TocItem[] {
  const tokens = marked.lexer(src);
  assignLines(src, tokens);
  const blockTokens = getBlockTokensDFS(tokens);
  const items: TocItem[] = [];
  let seq = 0;
  for (const t of blockTokens) {
    if (t.__nested || t.type !== 'heading') continue;
    items.push({
      key: `toc-${seq++}`,
      level: t.depth,
      text: headingText(t.text),
      lineStart: t.lineStart || 1,
    });
  }
  return items;
}
