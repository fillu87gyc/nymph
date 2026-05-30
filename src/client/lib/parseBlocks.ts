import { marked, Renderer } from 'marked';
import type { CodeContext, TableContext } from '../types.ts';
import { assignLines, esc, getBlockTokensDFS } from './markdown.ts';

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
  let idx = 0;
  const blocks: BlockData[] = [];
  let mermaidSeq = 0;
  const srcLines = src.split('\n');

  function buildContext(ls: number, le: number): CommentContext {
    const context = srcLines.slice(ls - 1, Math.min(ls + 2, le)).join('\n');
    return { displayCtx: context.split('\n')[0], context };
  }

  const renderer = new Renderer();

  function wrap(
    inner: string,
    type: string,
    commentContext?: CommentContext,
  ): string {
    const t = blockTokens[idx++] || {};
    if ((t as any).__nested) return inner;
    const ls = t.ls || 1,
      le = t.le || ls;
    blocks.push({
      key: `block-${blocks.length}`,
      html: inner,
      ls,
      le,
      type,
      commentContext: commentContext ?? buildContext(ls, le),
    });
    return '';
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
    const t = blockTokens[idx] || {}; // peek; wrap() will increment
    let commentContext: CommentContext | undefined;
    if (t.header) {
      const headers = t.header.map((cell: any) => cell.text || '');
      const rows = (t.rows || []).map((row: any[]) =>
        Object.fromEntries(
          row.map((cell: any, i: number) => [headers[i] ?? i, cell.text || '']),
        ),
      );
      commentContext = {
        displayCtx: headers.join(' | '),
        context: { headers, rows } as TableContext,
      };
    }
    return wrap(
      `<table><thead>${header}</thead><tbody>${body}</tbody></table>`,
      'table',
      commentContext,
    );
  };

  (renderer as any).code = (code: string, lang: string | undefined) => {
    const t = blockTokens[idx++] || {};
    if ((t as any).__nested) {
      return `<pre><code class="language-${esc(lang || 'plaintext')}">${esc(code)}</code></pre>`;
    }
    const ls = t.ls || 1,
      le = t.le || ls;
    const langStr = lang?.trim() || null;
    const codeCtx: CodeContext = langStr ? { lang: langStr, code } : { code };
    const commentContext: CommentContext = {
      displayCtx: code.split('\n')[0] || '',
      context: codeCtx,
    };

    if (lang === 'mermaid' || lang === 'mmd') {
      mermaidSeq++;
      blocks.push({
        key: `block-${blocks.length}`,
        html: '',
        ls,
        le,
        type: 'mermaid',
        commentContext,
        mermaidCode: code,
        mermaidId: `mermaid-${mermaidSeq}`,
      });
    } else {
      blocks.push({
        key: `block-${blocks.length}`,
        html: `<pre><code class="language-${esc(langStr || 'plaintext')}">${esc(code)}</code></pre>`,
        ls,
        le,
        type: 'code',
        commentContext,
      });
    }
    return '';
  };

  marked.parse(src, { renderer });

  return blocks;
}
