import { marked } from 'marked';
import type { CodeContext, TableContext } from '../types.ts';
import { assignLines, esc, getBlockTokensDFS } from './markdown.ts';
import { sanitizeHtml } from './sanitize.ts';

export interface CommentContext {
  displayCtx: string;
  context: string | TableContext | CodeContext;
}

export interface BlockData {
  key: string;
  html: string;
  ls: number;
  le: number;
  type: string;
  commentContext: CommentContext;
  mermaidCode?: string;
  mermaidId?: string;
}

export function parseBlocks(src: string): BlockData[] {
  const tokens = marked.lexer(src);
  assignLines(src, tokens);
  const blockTokens = getBlockTokensDFS(tokens);
  const blocks: BlockData[] = [];
  let mermaidSeq = 0;
  const srcLines = src.split('\n');

  function buildContext(ls: number, le: number): CommentContext {
    const context = srcLines.slice(ls - 1, Math.min(ls + 2, le)).join('\n');
    return { displayCtx: context.split('\n')[0], context };
  }

  for (const t of blockTokens) {
    if (t.__nested) continue;

    const ls: number = t.ls || 1;
    const le: number = t.le || ls;

    if (t.type === 'code') {
      const langStr: string | null = t.lang?.trim() || null;
      const codeCtx: CodeContext = langStr
        ? { lang: langStr, code: t.text }
        : { code: t.text };
      const commentContext: CommentContext = {
        displayCtx: (t.text as string).split('\n')[0] || '',
        context: codeCtx,
      };

      if (t.lang === 'mermaid' || t.lang === 'mmd') {
        mermaidSeq++;
        blocks.push({
          key: `block-${blocks.length}`,
          html: '',
          ls,
          le,
          type: 'mermaid',
          commentContext,
          mermaidCode: t.text,
          mermaidId: `mermaid-${mermaidSeq}`,
        });
      } else {
        blocks.push({
          key: `block-${blocks.length}`,
          html: `<pre><code class="language-${esc(langStr || 'plaintext')}">${esc(t.text)}</code></pre>`,
          ls,
          le,
          type: 'code',
          commentContext,
        });
      }
    } else if (t.type === 'table') {
      const headers = (t.header as any[]).map((cell: any) => cell.text || '');
      const rows = (t.rows as any[][]).map((row: any[]) =>
        Object.fromEntries(
          row.map((cell: any, i: number) => [headers[i] ?? i, cell.text || '']),
        ),
      );
      const commentContext: CommentContext = {
        displayCtx: headers.join(' | '),
        context: { headers, rows } as TableContext,
      };
      blocks.push({
        key: `block-${blocks.length}`,
        html: sanitizeHtml(marked.parse(t.raw) as string),
        ls,
        le,
        type: 'table',
        commentContext,
      });
    } else {
      // heading, paragraph, blockquote, list, hr, html
      blocks.push({
        key: `block-${blocks.length}`,
        html: sanitizeHtml((marked.parse(t.raw) as string).trim()),
        ls,
        le,
        type: t.type,
        commentContext: buildContext(ls, le),
      });
    }
  }

  return blocks;
}
