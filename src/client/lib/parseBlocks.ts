import { marked } from 'marked';
import type { CodeContext, TableContext } from '../types.ts';
import { rewriteImageSrc } from './imageSrc.ts';
import { assignLines, esc, getBlockTokensDFS } from './markdown.ts';
import { sanitizeHtml } from './sanitize.ts';

export interface CommentContext {
  displayCtx: string;
  context: string | TableContext | CodeContext;
}

export interface BlockData {
  key: string;
  html: string;
  lineStart: number;
  lineEnd: number;
  type: string;
  commentContext: CommentContext;
  mermaidCode?: string;
  mermaidId?: string;
}

/**
 * 本文をブロック（コメントが紐づく単位）へ分解し、描画用の HTML を作る。
 *
 * @param src  Markdown 本文
 * @param file 表示中の md ファイルの絶対パス。本文中の相対パス画像は
 *             このファイルの位置を起点に解決する（`imageSrc.ts`）。
 */
export function parseBlocks(
  src: string,
  file: string | null = null,
): BlockData[] {
  const tokens = marked.lexer(src);
  assignLines(src, tokens);
  const blockTokens = getBlockTokensDFS(tokens);
  const blocks: BlockData[] = [];
  let mermaidSeq = 0;
  const srcLines = src.split('\n');

  function buildContext(lineStart: number, lineEnd: number): CommentContext {
    const context = srcLines
      .slice(lineStart - 1, Math.min(lineStart + 2, lineEnd))
      .join('\n');
    return { displayCtx: context.split('\n')[0], context };
  }

  for (const t of blockTokens) {
    if (t.__nested) continue;

    const lineStart: number = t.lineStart || 1;
    const lineEnd: number = t.lineEnd || lineStart;

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
          lineStart,
          lineEnd,
          type: 'mermaid',
          commentContext,
          mermaidCode: t.text,
          mermaidId: `mermaid-${mermaidSeq}`,
        });
      } else {
        blocks.push({
          key: `block-${blocks.length}`,
          html: `<pre><code class="language-${esc(langStr || 'plaintext')}">${esc(t.text)}</code></pre>`,
          lineStart,
          lineEnd,
          type: 'code',
          commentContext,
        });
      }
    } else if (t.type === 'table') {
      const headers = t.header.map((cell) => cell.text || '');
      const rows = t.rows.map((row) =>
        Object.fromEntries(
          row.map((cell, i) => [headers[i] ?? i, cell.text || '']),
        ),
      );
      const commentContext: CommentContext = {
        displayCtx: headers.join(' | '),
        context: { headers, rows } as TableContext,
      };
      blocks.push({
        key: `block-${blocks.length}`,
        html: rewriteImageSrc(
          sanitizeHtml(marked.parse(t.raw) as string),
          file,
        ),
        lineStart,
        lineEnd,
        type: 'table',
        commentContext,
      });
    } else {
      // heading, paragraph, blockquote, list, hr, html
      blocks.push({
        key: `block-${blocks.length}`,
        html: rewriteImageSrc(
          sanitizeHtml((marked.parse(t.raw) as string).trim()),
          file,
        ),
        lineStart,
        lineEnd,
        type: t.type,
        commentContext: buildContext(lineStart, lineEnd),
      });
    }
  }

  return blocks;
}
